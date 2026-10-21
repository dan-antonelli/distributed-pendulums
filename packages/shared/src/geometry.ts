import type { PendulumConfig } from "./gen/pendulum/v1/pendulum_pb";

// Pure geometry, shared by the pendulum servers (collisions), the gateway (overlap check) and the UI (drawing).

// Bob size grows with mass, as if every bob were a ball of the same material:
// 8 times the mass gives twice the radius (DECISIONS D11).
const RADIUS_M_PER_CUBE_ROOT_KG = 0.1;

export function bobRadiusM(massKg: number): number {
  return RADIUS_M_PER_CUBE_ROOT_KG * Math.cbrt(massKg);
}

// Where the bob is, in meters. y grows downward from the anchor line.
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

// The bob at its configured starting angle.
export function startingBob(config: PendulumConfig): Bob {
  return { ...bobPosition(config, config.initialAngleRad), radiusM: bobRadiusM(config.massKg) };
}
