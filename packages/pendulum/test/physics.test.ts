import { describe, expect, test } from "vitest";
import { GRAVITY_M_S2, type Motion, STEP_S, step } from "../src/physics";

const LENGTH_M = 1;

function run(start: Motion, steps: number, stepFn = step): Motion[] {
  const history = [start];
  for (let i = 0; i < steps; i++) history.push(stepFn(history.at(-1)!, LENGTH_M, STEP_S));
  return history;
}

function energy({ angleRad, velocityRadS }: Motion): number {
  const height = GRAVITY_M_S2 * LENGTH_M * (1 - Math.cos(angleRad));
  const movement = 0.5 * (LENGTH_M * velocityRadS) ** 2;
  return height + movement;
}

describe("step", () => {
  test("a pendulum hanging straight down stays put", () => {
    const end = run({ angleRad: 0, velocityRadS: 0 }, 600).at(-1)!;
    expect(end).toEqual({ angleRad: 0, velocityRadS: 0 });
  });

  test("a pendulum pulled to the right starts swinging back left", () => {
    const next = step({ angleRad: 0.5, velocityRadS: 0 }, LENGTH_M, STEP_S);
    expect(next.velocityRadS).toBeLessThan(0);
    expect(next.angleRad).toBeLessThan(0.5);
  });

  test("a 1 m pendulum takes about 2 seconds per full swing, as in the real world", () => {
    const history = run({ angleRad: 0.1, velocityRadS: 0 }, 600);
    const backAtRight = history.findIndex((m, i) => i > 30 && m.velocityRadS >= 0 && history[i + 1]!.velocityRadS < 0);
    expect(backAtRight * STEP_S).toBeCloseTo(2.0, 1);
  });

  test("energy wobbles slightly within each swing, but never drifts", () => {
    const history = run({ angleRad: 1, velocityRadS: 0 }, 10_000);
    const start = energy(history[0]!);
    const wobble = (motions: Motion[]) => Math.max(...motions.map((m) => Math.abs(energy(m) - start) / start));

    const firstTenSeconds = wobble(history.slice(0, 600));
    const lastTenSeconds = wobble(history.slice(-600));

    expect(firstTenSeconds).toBeLessThan(0.03);
    expect(lastTenSeconds).toBeCloseTo(firstTenSeconds, 3);
  });

  test("plain Euler would gain energy over the same run: the reason for semi-implicit Euler", () => {
    const plainEuler = (m: Motion, lengthM: number, dtS: number): Motion => ({
      angleRad: m.angleRad + m.velocityRadS * dtS,
      velocityRadS: m.velocityRadS - (GRAVITY_M_S2 / lengthM) * Math.sin(m.angleRad) * dtS,
    });
    const history = run({ angleRad: 1, velocityRadS: 0 }, 10_000, plainEuler);
    expect(energy(history.at(-1)!)).toBeGreaterThan(energy(history[0]!) * 10);
  });
});
