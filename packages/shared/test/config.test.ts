import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { PendulumConfigSchema, validateConfig } from "../src";

const valid = { anchorXM: 0, lengthM: 1, massKg: 1, initialAngleRad: 0.5 };
const config = (overrides: Partial<typeof valid>) => create(PendulumConfigSchema, { ...valid, ...overrides });

describe("validateConfig", () => {
  test("accepts a sensible config", () => {
    expect(validateConfig(config({}))).toEqual([]);
  });

  test("rejects a zero length, which is also what a missing field decodes to", () => {
    expect(validateConfig(config({ lengthM: 0 }))).toEqual(["length_m must be between 0.1 and 5"]);
  });

  test("rejects angles past 90 degrees, where a real string would go slack", () => {
    expect(validateConfig(config({ initialAngleRad: 2 }))).toHaveLength(1);
  });

  test("rejects NaN, which binary protobuf can carry", () => {
    expect(validateConfig(config({ massKg: Number.NaN }))).toEqual(["mass_kg must be a finite number"]);
  });

  test("reports every problem at once, not just the first", () => {
    expect(validateConfig(config({ lengthM: -1, massKg: 0 }))).toHaveLength(2);
  });
});
