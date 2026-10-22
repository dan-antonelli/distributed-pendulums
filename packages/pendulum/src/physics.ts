export const GRAVITY_M_S2 = 9.81;
export const STEP_S = 1 / 60;

export interface Motion {
  angleRad: number;
  velocityRadS: number;
}

export function step(motion: Motion, lengthM: number, dtS: number): Motion {
  const accelerationRadS2 = -(GRAVITY_M_S2 / lengthM) * Math.sin(motion.angleRad);

  // Semi-implicit Euler: move using the NEW speed. The old speed (plain Euler) adds energy every step.
  const velocityRadS = motion.velocityRadS + accelerationRadS2 * dtS;
  const angleRad = motion.angleRad + velocityRadS * dtS;
  return { angleRad, velocityRadS };
}
