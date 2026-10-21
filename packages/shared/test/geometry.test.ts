import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { type Bob, PendulumConfigSchema, bobPosition, bobRadiusM, isTouching } from "../src";

const bob = (xM: number, yM = 1, radiusM = 0.1): Bob => ({ xM, yM, radiusM });

describe("bobRadiusM", () => {
  test("8 times the mass gives twice the radius, like balls of the same material", () => {
    expect(bobRadiusM(8)).toBeCloseTo(2 * bobRadiusM(1));
  });
});

describe("bobPosition", () => {
  const config = create(PendulumConfigSchema, { anchorXM: 2, lengthM: 1, massKg: 1 });

  test("at rest, the bob hangs straight below the anchor", () => {
    expect(bobPosition(config, 0)).toEqual({ xM: 2, yM: 1 });
  });

  test("at 90 degrees, the bob is level with the anchor, one length to the right", () => {
    const { xM, yM } = bobPosition(config, Math.PI / 2);
    expect(xM).toBeCloseTo(3);
    expect(yM).toBeCloseTo(0);
  });
});

describe("isTouching", () => {
  test("overlapping bobs are touching", () => {
    expect(isTouching(bob(0), bob(0.15))).toBe(true);
  });

  test("bobs with a small gap are not touching", () => {
    expect(isTouching(bob(0), bob(0.25))).toBe(false);
  });

  test("a bigger bob reaches further: same gap, touching once one bob is heavier", () => {
    expect(isTouching(bob(0), bob(0.25, 1, 0.2))).toBe(true);
  });
});
