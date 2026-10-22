import { type Bob, bobPosition, bobRadiusM, isTouching, validateConfig } from "@pendulums/shared";
import { describe, expect, test } from "vitest";
import { defaultConfig } from "../src/defaults";
import { type Motion, STEP_S, step } from "../src/physics";

function secondsUntilFirstCollision(serverCount: number): number | undefined {
  const configs = Array.from({ length: serverCount }, (_, i) => defaultConfig(i + 1));
  let motions: Motion[] = configs.map((c) => ({ angleRad: c.initialAngleRad, velocityRadS: 0 }));
  for (let tick = 0; tick < 60 * 10; tick++) {
    const bobs: Bob[] = configs.map((c, i) => ({
      ...bobPosition(c, motions[i]!.angleRad),
      radiusM: bobRadiusM(c.massKg),
    }));
    if (bobs.some((a, i) => bobs.some((b, j) => i < j && isTouching(a, b)))) return tick * STEP_S;
    motions = motions.map((m, i) => step(m, configs[i]!.lengthM, STEP_S));
  }
  return undefined;
}

describe("demo defaults", () => {
  test("are valid", () => {
    for (let slot = 1; slot <= 10; slot++) expect(validateConfig(defaultConfig(slot))).toEqual([]);
  });

  test.each([2, 5, 7])("with %i servers, nothing touches at the start, and a collision follows within 3 seconds", (count) => {
    const seconds = secondsUntilFirstCollision(count);
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(3);
  });
});
