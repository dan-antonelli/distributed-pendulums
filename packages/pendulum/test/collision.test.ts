import { create } from "@bufbuild/protobuf";
import { PendulumConfigSchema } from "@pendulums/shared";
import { describe, expect, test } from "vitest";
import { type Bob, bobRadiusM, canReach, isTouching, neighborsWithinReach, newContacts, touchingIds } from "../src/collision";

const config = (anchorXM: number, lengthM: number, massKg = 1) =>
  create(PendulumConfigSchema, { anchorXM, lengthM, massKg });
const bob = (xM: number, yM = 1, radiusM = 0.1): Bob => ({ xM, yM, radiusM });

describe("bobRadiusM", () => {
  test("8 times the mass gives twice the radius, like balls of the same material", () => {
    expect(bobRadiusM(8)).toBeCloseTo(2 * bobRadiusM(1));
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

describe("neighbors within reach", () => {
  test("pendulums too far apart to ever touch are not neighbors", () => {
    expect(canReach(config(0, 1), config(3, 1))).toBe(false);
  });

  test("a long pendulum can reach past its direct neighbor, so the one beyond is a neighbor too", () => {
    const peers = new Map([
      [1, config(0, 2)],
      [2, config(0.5, 0.3)],
      [3, config(1.5, 0.3)],
      [4, config(10, 0.3)],
    ]);
    expect(neighborsWithinReach(1, peers.get(1)!, peers)).toEqual([2, 3]);
  });

  test("a pendulum is never its own neighbor", () => {
    const peers = new Map([[1, config(0, 1)]]);
    expect(neighborsWithinReach(1, peers.get(1)!, peers)).toEqual([]);
  });
});

describe("collision triggering", () => {
  test("finds which neighbors are touching right now", () => {
    const others = new Map([
      [2, bob(0.15)],
      [3, bob(5)],
    ]);
    expect(touchingIds(bob(0), others)).toEqual(new Set([2]));
  });

  test("a collision fires at the moment bobs start touching", () => {
    expect(newContacts(new Set(), new Set([2]))).toEqual([2]);
  });

  test("bobs that stay touching do not fire again", () => {
    expect(newContacts(new Set([2]), new Set([2]))).toEqual([]);
  });

  test("bobs that separate and touch again fire again", () => {
    const apart = newContacts(new Set([2]), new Set());
    const again = newContacts(new Set(), new Set([2]));
    expect(apart).toEqual([]);
    expect(again).toEqual([2]);
  });
});
