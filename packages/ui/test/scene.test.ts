import { create } from "@bufbuild/protobuf";
import { PendulumPhase, PendulumViewSchema } from "@pendulums/shared";
import { describe, expect, test } from "vitest";
import { type Draft, draftOf, isEditable, pendingUpdates, restartCountdownS, swingFrame, systemState } from "../src/scene";

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

describe("swingFrame", () => {
  const pendulum = (anchorXM: number, lengthM = 1, initialAngleRad = Math.PI / 6) =>
    create(PendulumViewSchema, { config: { anchorXM, lengthM, massKg: 1, initialAngleRad } });

  test("frames where the bobs can actually swing, wherever the pendulums hang", () => {
    // Anchors follow the id, so pendulums can sit far from 0 m.
    // At 30 degrees a 1 m pendulum reaches 0.5 m sideways, plus its 0.1 m bob, plus the 0.15 m margin.
    const frame = swingFrame([pendulum(14.7), pendulum(17.5)]);
    expect(frame.xM).toBeCloseTo(14.7 - 0.75);
    expect(frame.xM + frame.widthM).toBeCloseTo(17.5 + 0.75);
  });

  test("leaves only a small margin under the lowest bob", () => {
    const frame = swingFrame([pendulum(0, 1), pendulum(1, 0.6)]);
    expect(frame.yM + frame.heightM).toBeCloseTo(1 + 0.1 + 0.1);
  });

  test("editing a pendulum that is neither at the edge nor the longest doesn't move the frame", () => {
    const before = swingFrame([pendulum(0), pendulum(1, 0.6), pendulum(2)]);
    const after = swingFrame([pendulum(0), pendulum(1, 0.9), pendulum(2)]);
    expect(after).toEqual(before);
  });

  test("with no pendulums, frames the first two meters", () => {
    const frame = swingFrame([]);
    expect(frame.xM).toBeCloseTo(-0.15);
    expect(frame.widthM).toBeCloseTo(2.3);
  });
});

describe("pendingUpdates", () => {
  const view = (id: number, lengthM = 1) =>
    create(PendulumViewSchema, { id, config: { anchorXM: id, lengthM, massKg: 1, initialAngleRad: 0.5 } });
  const draft = (p: ReturnType<typeof view>, changes: Partial<Draft> = {}): Draft => ({ ...draftOf(p), ...changes });

  test("no drafts means nothing to apply", () => {
    expect(pendingUpdates({}, [view(1), view(2)])).toEqual([]);
  });

  test("a draft equal to the applied config is left out", () => {
    const p = view(1);
    expect(pendingUpdates({ 1: draft(p) }, [p])).toEqual([]);
  });

  test("only the changed field is sent", () => {
    const p = view(1);
    expect(pendingUpdates({ 1: draft(p, { length: "2" }) }, [p])).toEqual([{ id: 1, lengthM: 2 }]);
  });

  test("several rows come back in pendulum order, skipping unchanged ones", () => {
    const [a, b, c] = [view(1), view(2), view(3)];
    const drafts = { 3: draft(c, { mass: "4" }), 1: draft(a, { angle: "90" }), 2: draft(b) };
    expect(pendingUpdates(drafts, [a, b, c])).toEqual([
      { id: 1, initialAngleRad: Math.PI / 2 },
      { id: 3, massKg: 4 },
    ]);
  });
});
