import { type MessageInitShape, create } from "@bufbuild/protobuf";
import {
  type Bus,
  type BusMessage,
  BusMessageSchema,
  CommandType,
  type ConfigUpdate,
  type Heartbeat,
  type PendulumConfig,
  PendulumPhase,
  type Position,
  type Stop,
  type Bob,
  bobPosition,
  bobRadiusM,
  channels,
  validateConfig,
} from "@pendulums/shared";
import { neighborsWithinReach, newContacts, touchingIds } from "./collision";
import { type Motion, step } from "./physics";

export const HEARTBEAT_INTERVAL_MS = 200;
// A peer silent for this long is treated as gone.
export const PEER_TIMEOUT_MS = 5000;
// RESTART and READY are resent this often during a cycle, in case one was lost.
export const RESEND_INTERVAL_MS = 1000;
export const RESTART_DELAY_MS = 5000;

const { STOPPED, RUNNING, PAUSED, HALTED, READY, WAITING } = PendulumPhase;
const IN_CYCLE: ReadonlySet<PendulumPhase> = new Set([HALTED, READY, WAITING]);

interface Peer {
  config: PendulumConfig;
  phase: PendulumPhase;
  cycle: number;
  lastSeenMs: number;
}

// One pendulum server's logic: its state machine and its part in the collision cycle.
// It knows nothing about Redis or the clock loop; main.ts wires those in. That keeps it testable on a fake bus.
export class PendulumController {
  private phaseNow: PendulumPhase = STOPPED;
  private motion: Motion;

  private readonly peers = new Map<number, Peer>();
  private neighbors = new Set<number>();
  private readonly neighborBobs = new Map<number, Bob>();
  private touching = new Set<number>();

  // The last collision cycle this server joined, and the highest number it has heard of.
  private cycleNumber = 0;
  private highestCycleSeen = 0;
  private participants = new Set<number>();
  private restartsFrom = new Set<number>();
  private readiesFrom = new Set<number>();
  private restartAtMs = 0;

  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private resendTimer?: ReturnType<typeof setInterval>;
  private restartTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly id: number,
    private config: PendulumConfig,
    private readonly bus: Bus,
  ) {
    this.motion = this.startingMotion();
  }

  get phase(): PendulumPhase {
    return this.phaseNow;
  }

  get cycle(): number {
    return this.cycleNumber;
  }

  get angleRad(): number {
    return this.motion.angleRad;
  }

  start(): void {
    this.bus.subscribe(channels.heartbeat, this.onMessage);
    this.bus.subscribe(channels.control, this.onMessage);
    this.publishHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.dropSilentPeers();
      this.publishHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  dispose(): void {
    clearInterval(this.heartbeatTimer);
    this.clearCycleTimers();
    this.bus.unsubscribe(channels.heartbeat);
    this.bus.unsubscribe(channels.control);
    for (const id of this.neighbors) this.bus.unsubscribe(channels.position(id));
  }

  // Called by the simulation loop once per fixed step.
  tick(dtS: number): void {
    if (this.phaseNow === RUNNING) this.motion = step(this.motion, this.config.lengthM, dtS);

    const { xM, yM } = bobPosition(this.config, this.motion.angleRad);
    this.publish(channels.position(this.id), {
      case: "position",
      value: { id: this.id, bobXM: xM, bobYM: yM, phase: this.phaseNow },
    });

    if (this.phaseNow !== RUNNING) return;
    const self: Bob = { xM, yM, radiusM: bobRadiusM(this.config.massKg) };
    const now = touchingIds(self, this.neighborBobs);
    const [hitId] = newContacts(this.touching, now);
    this.touching = now;
    if (hitId !== undefined) this.startCycle(hitId);
  }

  // --- Incoming messages ---

  private readonly onMessage = (message: BusMessage): void => {
    const { body } = message;
    switch (body.case) {
      case "heartbeat":
        return this.onHeartbeat(body.value);
      case "position":
        return this.onPosition(body.value);
      case "stop":
        return this.onStop(body.value);
      case "restart":
        return this.onCycleMessage(body.value, this.restartsFrom);
      case "ready":
        return this.onCycleMessage(body.value, this.readiesFrom);
      case "command":
        return this.onCommand(body.value.type);
      case "configUpdate":
        return this.onConfigUpdate(body.value);
    }
  };

  private onHeartbeat(heartbeat: Heartbeat): void {
    if (heartbeat.id === this.id || !heartbeat.config) return;
    this.peers.set(heartbeat.id, {
      config: heartbeat.config,
      phase: heartbeat.phase,
      cycle: heartbeat.cycle,
      lastSeenMs: Date.now(),
    });
    this.highestCycleSeen = Math.max(this.highestCycleSeen, heartbeat.cycle);

    // A peer is already in a newer cycle, so we missed its STOP. Join now.
    if (IN_CYCLE.has(heartbeat.phase) && heartbeat.cycle > this.cycleNumber) this.joinCycle(heartbeat.cycle);
    this.updateNeighbors();
  }

  private onPosition(position: Position): void {
    const peer = this.peers.get(position.id);
    if (!peer) return;
    // Only running bobs count. A neighbor still frozen from the last cycle must not trigger a new one.
    if (position.phase !== RUNNING) {
      this.neighborBobs.delete(position.id);
      return;
    }
    this.neighborBobs.set(position.id, {
      xM: position.bobXM,
      yM: position.bobYM,
      radiusM: bobRadiusM(peer.config.massKg),
    });
  }

  private onStop(stop: Stop): void {
    this.highestCycleSeen = Math.max(this.highestCycleSeen, stop.cycle);
    // Same or older cycle: a duplicate or a late message. Ignore it.
    if (stop.cycle > this.cycleNumber) this.joinCycle(stop.cycle);
  }

  private onCycleMessage(message: { fromId: number; cycle: number }, received: Set<number>): void {
    // A RESTART or READY from a newer cycle also means we missed its STOP.
    if (message.cycle > this.cycleNumber) this.joinCycle(message.cycle);
    if (message.cycle !== this.cycleNumber || !IN_CYCLE.has(this.phaseNow)) return;
    received.add(message.fromId);
    this.advanceCycle();
  }

  private onCommand(type: CommandType): void {
    switch (type) {
      // Start and pause are ignored during a collision cycle. Only stop can interrupt it.
      case CommandType.START:
        if (this.phaseNow === STOPPED || this.phaseNow === PAUSED) this.phaseNow = RUNNING;
        break;
      case CommandType.PAUSE:
        if (this.phaseNow === RUNNING) this.phaseNow = PAUSED;
        break;
      case CommandType.STOP:
        this.stopAndReset();
        break;
    }
  }

  private onConfigUpdate(update: ConfigUpdate): void {
    if (update.id !== this.id || !update.config) return;
    // The gateway checks too, but its view can be a moment old. The server has the final say.
    if (this.phaseNow !== STOPPED || validateConfig(update.config).length > 0) return;
    this.config = update.config;
    this.motion = this.startingMotion();
    this.updateNeighbors();
    this.publishHeartbeat();
  }

  // --- The collision cycle ---

  private startCycle(hitId: number): void {
    const cycle = Math.max(this.cycleNumber, this.highestCycleSeen) + 1;
    this.publish(channels.control, { case: "stop", value: { fromId: this.id, cycle, hitId } });
    this.joinCycle(cycle);
  }

  private joinCycle(cycle: number): void {
    // A user stop ends everything; nothing pulls a stopped pendulum into a cycle.
    if (this.phaseNow === STOPPED) return;

    this.clearCycleTimers();
    this.cycleNumber = cycle;
    this.highestCycleSeen = Math.max(this.highestCycleSeen, cycle);
    this.phaseNow = HALTED;

    // Freeze who we wait for. Servers that join later don't change it.
    this.participants = new Set([this.id, ...this.livePeerIds()]);
    this.restartsFrom = new Set([this.id]);
    this.readiesFrom = new Set();

    this.sendCycleMessages();
    this.resendTimer = setInterval(() => this.sendCycleMessages(), RESEND_INTERVAL_MS);
    this.advanceCycle();
  }

  private advanceCycle(): void {
    if (this.phaseNow === HALTED && this.heardFromAll(this.restartsFrom)) {
      // "I have RESTART from everyone." Now everyone needs to know that everyone does.
      this.phaseNow = READY;
      this.readiesFrom.add(this.id);
      this.sendCycleMessages();
    }
    if (this.phaseNow === READY && this.heardFromAll(this.readiesFrom)) {
      this.phaseNow = WAITING;
      this.restartAtMs = Date.now() + RESTART_DELAY_MS;
      this.restartTimer = setTimeout(() => this.restart(), RESTART_DELAY_MS);
    }
  }

  private heardFromAll(received: ReadonlySet<number>): boolean {
    return [...this.participants].every((id) => received.has(id));
  }

  private sendCycleMessages(): void {
    const value = { fromId: this.id, cycle: this.cycleNumber };
    this.publish(channels.control, { case: "restart", value });
    if (this.phaseNow === READY || this.phaseNow === WAITING) this.publish(channels.control, { case: "ready", value });
  }

  private restart(): void {
    this.clearCycleTimers();
    // Back to the configured start. Resuming from the collision spot would collide again at once.
    this.motion = this.startingMotion();
    this.touching = new Set();
    this.phaseNow = RUNNING;
    this.publishHeartbeat();
  }

  private stopAndReset(): void {
    this.clearCycleTimers();
    this.motion = this.startingMotion();
    this.touching = new Set();
    this.phaseNow = STOPPED;
  }

  private clearCycleTimers(): void {
    clearInterval(this.resendTimer);
    clearTimeout(this.restartTimer);
  }

  // --- Membership and neighbors ---

  private livePeerIds(): number[] {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    return [...this.peers]
      .filter(([, peer]) => peer.lastSeenMs >= cutoff && peer.phase !== STOPPED)
      .map(([id]) => id);
  }

  private dropSilentPeers(): void {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    let dropped = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeenMs < cutoff) {
        this.peers.delete(id);
        this.participants.delete(id);
        dropped = true;
      }
    }
    if (!dropped) return;
    this.updateNeighbors();
    // The one we were waiting for may be gone: check whether the cycle can move on.
    if (IN_CYCLE.has(this.phaseNow)) this.advanceCycle();
  }

  // Subscribe only to the position channels of pendulums within reach.
  private updateNeighbors(): void {
    const configs = new Map([...this.peers].map(([id, peer]) => [id, peer.config]));
    const next = new Set(neighborsWithinReach(this.id, this.config, configs));
    for (const id of this.neighbors) {
      if (!next.has(id)) {
        this.bus.unsubscribe(channels.position(id));
        this.neighborBobs.delete(id);
      }
    }
    for (const id of next) {
      if (!this.neighbors.has(id)) this.bus.subscribe(channels.position(id), this.onMessage);
    }
    this.neighbors = next;
  }

  // --- Outgoing ---

  private publishHeartbeat(): void {
    this.publish(channels.heartbeat, {
      case: "heartbeat",
      value: {
        id: this.id,
        config: this.config,
        phase: this.phaseNow,
        cycle: this.cycleNumber,
        restartInMs: this.phaseNow === WAITING ? Math.max(0, this.restartAtMs - Date.now()) : 0,
      },
    });
  }

  private publish(channel: string, body: MessageInitShape<typeof BusMessageSchema>["body"]): void {
    this.bus.publish(channel, create(BusMessageSchema, { body }));
  }

  private startingMotion(): Motion {
    return { angleRad: this.config.initialAngleRad, velocityRadS: 0 };
  }
}
