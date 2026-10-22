import { create } from "@bufbuild/protobuf";
import { type BusMessage, type PendulumConfig, type PendulumView, PendulumViewSchema } from "@pendulums/shared";

// Shorter than the servers' 5 s: a wrong guess here only affects the display, never the collision cycle.
export const STALE_AFTER_MS = 2000;

export class SystemView {
  private readonly pendulums = new Map<number, { view: PendulumView; lastSeenMs: number }>();

  readonly onMessage = (message: BusMessage): void => {
    const { body } = message;
    const now = Date.now();
    if (body.case === "heartbeat") {
      const { id, config, phase, cycle, restartInMs } = body.value;
      if (!config) return;
      const existing = this.pendulums.get(id)?.view;
      const view = create(PendulumViewSchema, {
        id,
        config,
        phase,
        cycle,
        restartInMs,
        // Positions arrive far more often than heartbeats, so keep the last known one.
        bobXM: existing?.bobXM ?? config.anchorXM,
        bobYM: existing?.bobYM ?? config.lengthM,
      });
      this.pendulums.set(id, { view, lastSeenMs: now });
    } else if (body.case === "position") {
      const entry = this.pendulums.get(body.value.id);
      if (!entry) return;
      entry.view.bobXM = body.value.bobXM;
      entry.view.bobYM = body.value.bobYM;
      entry.view.phase = body.value.phase;
      entry.lastSeenMs = now;
    }
  };

  // Optimistic, so a second quick edit merges with this one instead of the old config.
  // If the pendulum rejects the change, its next heartbeat puts the real config back.
  rememberSentConfig(id: number, config: PendulumConfig): void {
    const entry = this.pendulums.get(id);
    if (entry) entry.view.config = config;
  }

  get(id: number): PendulumView | undefined {
    return this.pendulums.get(id)?.view;
  }

  configs(): Map<number, PendulumConfig> {
    const configs = new Map<number, PendulumConfig>();
    for (const [id, { view }] of this.pendulums) if (view.config) configs.set(id, view.config);
    return configs;
  }

  snapshot(): PendulumView[] {
    const cutoff = Date.now() - STALE_AFTER_MS;
    for (const [id, { lastSeenMs }] of this.pendulums) if (lastSeenMs < cutoff) this.pendulums.delete(id);
    return [...this.pendulums.values()].map(({ view }) => view).sort((a, b) => a.id - b.id);
  }
}
