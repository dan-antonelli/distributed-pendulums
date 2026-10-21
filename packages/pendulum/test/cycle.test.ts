import { CommandType, PendulumPhase } from "@pendulums/shared";
import { InMemoryBus } from "@pendulums/shared/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PendulumController, RESTART_DELAY_MS } from "../src/controller";
import { STEP_S } from "../src/physics";
import { actAs, config, isRestartFrom, isStop } from "./helpers";

const { STOPPED, RUNNING, HALTED, READY, WAITING } = PendulumPhase;
const IN_CYCLE = new Set([HALTED, READY, WAITING]);
const TICK_MS = 1000 / 60;

// Five real controllers on one fake bus. Pendulums 1 and 2 swing toward each other and collide
// within about a second. 3, 4 and 5 hang still, far enough away to never be hit.
let bus: InMemoryBus;
let servers: PendulumController[];
let user: ReturnType<typeof actAs>;
let clockMs: number;

beforeEach(() => {
  vi.useFakeTimers();
  bus = new InMemoryBus();
  const configs = [config(0, -0.5), config(1, 0.5), config(3), config(4.5), config(6)];
  servers = configs.map((c, i) => new PendulumController(i + 1, c, bus.connect(`server-${i + 1}`)));
  user = actAs(bus.connect("user"));
  clockMs = 0;
  for (const server of servers) server.start();
  run(500);
  user.command(CommandType.START);
});

afterEach(() => {
  for (const server of servers) server.dispose();
  vi.useRealTimers();
});

// Advances time in fixed steps, ticking every server, like the real loop does.
// Stops early if `until` becomes true. Returns whether it did.
function run(ms: number, until?: () => boolean): boolean {
  for (const end = clockMs + ms; clockMs < end; clockMs += TICK_MS) {
    vi.advanceTimersByTime(TICK_MS);
    for (const server of servers) server.tick(STEP_S);
    if (until?.()) return true;
  }
  return false;
}

const all = (servers: PendulumController[], check: (s: PendulumController) => boolean) => servers.every(check);
const inCycle = (s: PendulumController) => IN_CYCLE.has(s.phase);

describe("the whole collision cycle on five servers", () => {
  test("a collision halts everyone, and they all restart together 5 seconds after the last READY", () => {
    expect(run(3000, () => servers.some(inCycle))).toBe(true);
    run(50);
    expect(all(servers, inCycle)).toBe(true);
    expect(all(servers, (s) => s.cycle === 1)).toBe(true);

    expect(run(2000, () => all(servers, (s) => s.phase === WAITING))).toBe(true);
    const allWaitingAtMs = clockMs;

    const restartedAtMs = new Map<number, number>();
    run(RESTART_DELAY_MS + 500, () => {
      for (const s of servers) if (s.phase === RUNNING && !restartedAtMs.has(s.id)) restartedAtMs.set(s.id, clockMs);
      return restartedAtMs.size === servers.length;
    });

    const times = [...restartedAtMs.values()];
    expect(times).toHaveLength(5);
    expect(Math.min(...times) - allWaitingAtMs).toBeGreaterThanOrEqual(RESTART_DELAY_MS - 100);
    // Everyone restarts within a few ticks of each other.
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(100);
  });

  test("two servers reporting the same collision at once start one cycle, not two", () => {
    user.stop(1, 1);
    user.stop(2, 1);
    expect(run(RESTART_DELAY_MS + 1000, () => all(servers, (s) => s.phase === RUNNING && s.cycle === 1))).toBe(true);
  });

  test("a lost RESTART is recovered by the resend", () => {
    let dropped = false;
    bus.filter = (_receiver, _channel, message) => {
      if (!dropped && isRestartFrom(3)(message)) {
        dropped = true;
        return false;
      }
      return true;
    };

    run(3000, () => servers.some(inCycle));
    expect(run(RESTART_DELAY_MS + 3000, () => all(servers, (s) => s.phase === RUNNING))).toBe(true);
    expect(dropped).toBe(true);
  });

  test("a server that missed the STOP joins through heartbeats", () => {
    bus.filter = (receiver, _channel, message) => !(receiver === "server-4" && isStop(message));

    run(3000, () => servers.some(inCycle));
    expect(run(1000, () => servers[3]!.phase !== RUNNING)).toBe(true);
    expect(servers[3]!.cycle).toBe(1);
    expect(run(RESTART_DELAY_MS + 3000, () => all(servers, (s) => s.phase === RUNNING))).toBe(true);
  });

  test("a server that dies mid-cycle is dropped, and the rest still restart", () => {
    run(3000, () => servers.some(inCycle));
    const dead = servers.pop()!;
    dead.dispose();

    // Still blocked: the others are waiting for the dead server's RESTART.
    run(3000);
    expect(all(servers, (s) => s.phase === HALTED)).toBe(true);

    expect(run(RESTART_DELAY_MS + 5000, () => all(servers, (s) => s.phase === RUNNING))).toBe(true);
  });

  test("user stop during the wait: nobody restarts", () => {
    run(3000, () => servers.some(inCycle));
    run(2000, () => all(servers, (s) => s.phase === WAITING));

    user.command(CommandType.STOP);
    run(RESTART_DELAY_MS * 2);
    expect(all(servers, (s) => s.phase === STOPPED)).toBe(true);
  });
});
