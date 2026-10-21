import { describe, expect, test } from "vitest";
import { MAX_STEPS_PER_TICK, planSteps } from "../src/loop";

const STEP = 0.01;

describe("planSteps", () => {
  test("less than one step of time: no step yet, and the time is kept for next tick", () => {
    const { steps, leftoverS } = planSteps(0.004, STEP);
    expect(steps).toBe(0);
    expect(leftoverS).toBeCloseTo(0.004);
  });

  test("a late timer catches up with several steps, carrying the remainder", () => {
    const { steps, leftoverS } = planSteps(0.035, STEP);
    expect(steps).toBe(3);
    expect(leftoverS).toBeCloseTo(0.005);
  });

  test("after a long freeze, runs only the capped number of steps and drops the backlog", () => {
    expect(planSteps(2, STEP)).toEqual({ steps: MAX_STEPS_PER_TICK, leftoverS: 0 });
  });
});
