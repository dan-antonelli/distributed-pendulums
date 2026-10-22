import { create } from "@bufbuild/protobuf";
import { type PendulumConfig, PendulumConfigSchema } from "@pendulums/shared";

const SPACING_M = 0.7;

// Long and short strings alternate: short ones swing faster, so neighbors meet about a second
// after start, for any number of servers.
export function defaultConfig(slot: number): PendulumConfig {
  return create(PendulumConfigSchema, {
    anchorXM: slot * SPACING_M,
    lengthM: slot % 2 === 1 ? 1 : 0.6,
    massKg: 1,
    initialAngleRad: 0.8,
  });
}
