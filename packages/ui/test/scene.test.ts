import { create } from "@bufbuild/protobuf";
import { PendulumPhase, PendulumViewSchema } from "@pendulums/shared";
import { describe, expect, test } from "vitest";
import { isEditable, restartCountdownS, systemState } from "../src/scene";

const { STOPPED, RUNNING, PAUSED, HALTED, WAITING } = PendulumPhase;
const pendulum = (phase: PendulumPhase, restartInMs = 0) => create(PendulumViewSchema, { phase, restartInMs });

describe("systemState", () => {
  test("any pendulum in a collision cycle makes the whole system a collision", () => {
    expect(systemState([pendulum(RUNNING), pendulum(HALTED)])).toBe("collision");
  });

  test("running wins over paused and stopped", () => {
    expect(systemState([pendulum(PAUSED), pendulum(RUNNING), pendulum(STOPPED)])).toBe("running");
  });

  test("no pendulums is its own state, so the UI can explain it", () => {
    expect(systemState([])).toBe("empty");
  });
});

test("config is editable only when every pendulum is stopped", () => {
  expect(isEditable([pendulum(STOPPED), pendulum(STOPPED)])).toBe(true);
  expect(isEditable([pendulum(STOPPED), pendulum(PAUSED)])).toBe(false);
});

test("the countdown follows the pendulum that will restart last", () => {
  expect(restartCountdownS([pendulum(WAITING, 3000), pendulum(WAITING, 3200), pendulum(HALTED)])).toBe(3.2);
  expect(restartCountdownS([pendulum(HALTED)])).toBeUndefined();
});
