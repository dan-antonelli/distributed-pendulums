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

const SIDE_MARGIN_M = 0.15;
const BOTTOM_MARGIN_M = 0.1;
// Room above the beam for the pendulum numbers.
const TOP_M = 0.3;

// The area to frame, in meters: everywhere a bob can actually go, plus a small margin.
// A frictionless pendulum never swings wider than the angle it started from, so each bob's sideways
// reach is length × sin(starting angle), not its full length. Its lowest point is straight down.
// Only the outermost and the longest pendulums shape the frame; editing any other one moves nothing.
export function swingFrame(pendulums: PendulumView[]) {
  const configs = pendulums.flatMap((p) => (p.config ? [p.config] : []));
  if (configs.length === 0) return { xM: -SIDE_MARGIN_M, yM: -TOP_M, widthM: 2 + 2 * SIDE_MARGIN_M, heightM: 1 + TOP_M };

  const reach = configs.map((c) => {
    const radiusM = bobRadiusM(c.massKg);
    const sidewaysM = c.lengthM * Math.sin(Math.min(Math.abs(c.initialAngleRad), Math.PI / 2)) + radiusM;
    return { left: c.anchorXM - sidewaysM, right: c.anchorXM + sidewaysM, bottom: c.lengthM + radiusM };
  });
  const left = Math.min(...reach.map((r) => r.left)) - SIDE_MARGIN_M;
  const right = Math.max(...reach.map((r) => r.right)) + SIDE_MARGIN_M;
  const bottom = Math.max(...reach.map((r) => r.bottom)) + BOTTOM_MARGIN_M;
  return { xM: left, yM: -TOP_M, widthM: right - left, heightM: bottom + TOP_M };
}
