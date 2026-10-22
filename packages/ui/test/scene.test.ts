import { create } from "@bufbuild/protobuf";
import { PendulumConfigSchema, PendulumPhase, PendulumViewSchema, firstOverlap, limits } from "@pendulums/shared";
import { describe, expect, test } from "vitest";
import {
  type Draft,
  anchorRangeOf,
  draftOf,
  isEditable,
  pendingUpdates,
  randomDrafts,
  restartCountdownS,
  swingFrame,
  systemState,
} from "../src/scene";
import { seeded, view } from "./support";

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

test("the anchor range for the inputs never leaves the allowed limits", () => {
  const at = (anchorXM: number) => create(PendulumViewSchema, { config: { anchorXM, lengthM: 1, massKg: 1 } });
  expect(anchorRangeOf([at(-19.5), at(19.5)])).toEqual(limits.anchorXM);
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

  test("several rows come back in id order, skipping unchanged ones", () => {
    const [a, b, c] = [view(1), view(2), view(3)];
    const drafts = { 3: draft(c, { mass: "4" }), 1: draft(a, { angle: "90" }), 2: draft(b) };
    expect(pendingUpdates(drafts, [a, b, c])).toEqual([
      { id: 1, initialAngleRad: Math.PI / 2 },
      { id: 3, massKg: 4 },
    ]);
  });
});

describe("randomDrafts", () => {
  const pendulums = [view(1), view(2), view(3), view(4), view(5)];
  const configsOf = (drafts: Record<number, Draft>) =>
    new Map(
      Object.entries(drafts).map(([id, d]) => [
        Number(id),
        create(PendulumConfigSchema, {
          anchorXM: Number(d.anchor),
          lengthM: Number(d.length),
          massKg: Number(d.mass),
          initialAngleRad: (Number(d.angle) * Math.PI) / 180,
        }),
      ]),
    );

  test("every value is within the allowed ranges", () => {
    const drafts = randomDrafts(pendulums, seeded(1))!;
    const anchors = anchorRangeOf(pendulums);
    expect(Object.keys(drafts)).toHaveLength(5);
    for (const d of Object.values(drafts)) {
      expect(Number(d.anchor)).toBeGreaterThanOrEqual(anchors.min);
      expect(Number(d.anchor)).toBeLessThanOrEqual(anchors.max);
      expect(Number(d.length)).toBeGreaterThanOrEqual(limits.lengthM.min);
      expect(Number(d.length)).toBeLessThanOrEqual(limits.lengthM.max);
      expect(Number(d.mass)).toBeGreaterThanOrEqual(limits.massKg.min);
      expect(Number(d.mass)).toBeLessThanOrEqual(limits.massKg.max);
      expect(Number(d.angle)).toBeGreaterThanOrEqual(-90);
      expect(Number(d.angle)).toBeLessThanOrEqual(90);
    }
  });

  test("no two bobs start overlapping", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const configs = configsOf(randomDrafts(pendulums, seeded(seed))!);
      for (const [id, config] of configs) expect(firstOverlap(id, config, configs)).toBeUndefined();
    }
  });

  test("the same seed gives the same drafts", () => {
    expect(randomDrafts(pendulums, seeded(7))).toEqual(randomDrafts(pendulums, seeded(7)));
  });

  test("gives up after the allowed attempts when every set overlaps", () => {
    const sameAnchor = [view(1), view(1)].map((p, i) => ({ ...p, id: i + 1 }));
    let calls = 0;
    const constant = () => {
      calls++;
      return 0.5;
    };
    expect(randomDrafts(sameAnchor, constant, 3)).toBeUndefined();
    expect(calls).toBe(3 * 2 * 4);
  });
});
