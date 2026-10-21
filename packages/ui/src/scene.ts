import { type PendulumView, PendulumPhase, bobRadiusM } from "@pendulums/shared";

const { STOPPED, RUNNING, PAUSED, HALTED, READY, WAITING } = PendulumPhase;

export type SystemState = "empty" | "stopped" | "running" | "paused" | "collision";

// One word for the whole system, derived from every pendulum's phase.
export function systemState(pendulums: PendulumView[]): SystemState {
  if (pendulums.length === 0) return "empty";
  const phases = new Set(pendulums.map((p) => p.phase));
  if ([HALTED, READY, WAITING].some((phase) => phases.has(phase))) return "collision";
  if (phases.has(RUNNING)) return "running";
  if (phases.has(PAUSED)) return "paused";
  return "stopped";
}

export const isEditable = (pendulums: PendulumView[]) => pendulums.every((p) => p.phase === STOPPED);

// Seconds until the collision cycle restarts, or undefined if nobody is waiting yet.
export function restartCountdownS(pendulums: PendulumView[]): number | undefined {
  const waiting = pendulums.filter((p) => p.phase === WAITING);
  if (waiting.length === 0) return undefined;
  return Math.max(...waiting.map((p) => p.restartInMs)) / 1000;
}

// The area to draw, in meters: wide and deep enough for every pendulum at any angle.
export function sceneBounds(pendulums: PendulumView[]) {
  const reach = pendulums.map((p) => {
    const lengthM = p.config?.lengthM ?? 1;
    const anchorXM = p.config?.anchorXM ?? 0;
    const radiusM = bobRadiusM(p.config?.massKg ?? 1);
    return { left: anchorXM - lengthM - radiusM, right: anchorXM + lengthM + radiusM, depth: lengthM + radiusM };
  });
  const margin = 0.3;
  const left = Math.min(0, ...reach.map((r) => r.left)) - margin;
  const right = Math.max(2, ...reach.map((r) => r.right)) + margin;
  const depth = Math.max(1, ...reach.map((r) => r.depth)) + margin;
  return { xM: left, yM: -0.35, widthM: right - left, heightM: depth + 0.35 };
}
