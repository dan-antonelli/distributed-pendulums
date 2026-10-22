import type { PendulumConfig } from "./gen/pendulum/v1/pendulum_pb";

// Every bob is a ball of the same material: 8 times the mass gives twice the radius.
const RADIUS_M_PER_CUBE_ROOT_KG = 0.1;

export function bobRadiusM(massKg: number): number {
  return RADIUS_M_PER_CUBE_ROOT_KG * Math.cbrt(massKg);
}

export function bobPosition(config: PendulumConfig, angleRad: number): { xM: number; yM: number } {
  return {
    xM: config.anchorXM + config.lengthM * Math.sin(angleRad),
    yM: config.lengthM * Math.cos(angleRad),
  };
}

export interface Bob {
  xM: number;
  yM: number;
  radiusM: number;
}

export function isTouching(a: Bob, b: Bob): boolean {
  return Math.hypot(a.xM - b.xM, a.yM - b.yM) < a.radiusM + b.radiusM;
}

export function startingBob(config: PendulumConfig): Bob {
  return { ...bobPosition(config, config.initialAngleRad), radiusM: bobRadiusM(config.massKg) };
}

// Starting overlapped would fire a collision the instant the user presses start.
export function firstOverlap(id: number, config: PendulumConfig, others: Map<number, PendulumConfig>): number | undefined {
  const bob = startingBob(config);
  for (const [otherId, other] of others) {
    if (otherId !== id && isTouching(bob, startingBob(other))) return otherId;
  }
  return undefined;
}
