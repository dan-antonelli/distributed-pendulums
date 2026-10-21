import { create } from "@bufbuild/protobuf";
import { type BusMessage, type PendulumConfig, type PendulumView, PendulumViewSchema } from "@pendulums/shared";

// A pendulum silent this long disappears from the UI. Shorter than the servers' 5 s:
// a wrong guess here only affects the display, never the collision cycle.
export const STALE_AFTER_MS = 2000;

// The gateway's picture of the system, built only from what it hears on the bus.
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
        // Keep the last known bob position; positions arrive far more often than heartbeats.
        bobXM: existing?.bobXM ?? config.anchorXM,
        bobYM: existing?.bobYM ?? config.lengthM,
      });
      this.pendulums.set(id, { view, lastSeenMs: now });
    } else if (body.case === "position") {
      const entry = this.pendulums.get(body.value.id);
      // A position before the first heartbeat has no config to go with it. Wait for the heartbeat.
      if (!entry) return;
      entry.view.bobXM = body.value.bobXM;
      entry.view.bobYM = body.value.bobYM;
      entry.view.phase = body.value.phase;
      entry.lastSeenMs = now;
    }
  };

  get(id: number): PendulumView | undefined {
    return this.pendulums.get(id)?.view;
  }

  configs(): Map<number, PendulumConfig> {
    const configs = new Map<number, PendulumConfig>();
    for (const [id, { view }] of this.pendulums) if (view.config) configs.set(id, view.config);
    return configs;
  }

  // Every live pendulum, by id. Drops the ones that went silent.
  snapshot(): PendulumView[] {
    const cutoff = Date.now() - STALE_AFTER_MS;
    for (const [id, { lastSeenMs }] of this.pendulums) if (lastSeenMs < cutoff) this.pendulums.delete(id);
    return [...this.pendulums.values()].map(({ view }) => view).sort((a, b) => a.id - b.id);
  }
}
