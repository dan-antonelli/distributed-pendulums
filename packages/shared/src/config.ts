import type { PendulumConfig } from "./gen/pendulum/v1/pendulum_pb";

// Protobuf checks types, not meaning. These are the rules it can't express.
export const limits = {
  lengthM: { min: 0.1, max: 5 },
  massKg: { min: 0.1, max: 20 },
  // Past 90 degrees a real string goes slack. The model treats it as a rigid rod, so cap it.
  angleRad: { min: -Math.PI / 2, max: Math.PI / 2 },
} as const;

// Returns a list of problems. Empty means valid.
export function validateConfig(config: PendulumConfig): string[] {
  const errors: string[] = [];
  const check = (name: string, value: number, range?: { min: number; max: number }) => {
    // Binary protobuf can carry NaN and Infinity, so check before comparing.
    if (!Number.isFinite(value)) {
      errors.push(`${name} must be a finite number`);
    } else if (range && (value < range.min || value > range.max)) {
      errors.push(`${name} must be between ${range.min} and ${range.max}`);
    }
  };

  check("anchor_x_m", config.anchorXM);
  check("length_m", config.lengthM, limits.lengthM);
  check("mass_kg", config.massKg, limits.massKg);
  check("initial_angle_rad", config.initialAngleRad, limits.angleRad);
  return errors;
}
