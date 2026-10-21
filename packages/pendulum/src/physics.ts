export const GRAVITY_M_S2 = 9.81;
// One physics step. The loop always advances by exactly this much.
export const STEP_S = 1 / 60;

export interface Motion {
  angleRad: number;
  // How fast the angle is changing, in radians per second.
  velocityRadS: number;
}

// Pure: same input, same output. No timers, no I/O, so it's testable on its own.
export function step(motion: Motion, lengthM: number, dtS: number): Motion {
  // Gravity pulls the bob back toward the middle, harder the further out it is.
  const accelerationRadS2 = -(GRAVITY_M_S2 / lengthM) * Math.sin(motion.angleRad);

  // Semi-implicit Euler: update speed first, then move using the NEW speed.
  // Using the old speed instead (plain Euler) adds energy every step.
  const velocityRadS = motion.velocityRadS + accelerationRadS2 * dtS;
  const angleRad = motion.angleRad + velocityRadS * dtS;
  return { angleRad, velocityRadS };
}
