import { STEP_S } from "./physics";

export const MAX_STEPS_PER_TICK = 5;

export function planSteps(accumulatedS: number, stepS: number): { steps: number; leftoverS: number } {
  const due = Math.floor(accumulatedS / stepS);
  if (due > MAX_STEPS_PER_TICK) {
    // Catching up fully would take long enough to fall behind again (the "spiral of death"), so drop the rest.
    return { steps: MAX_STEPS_PER_TICK, leftoverS: 0 };
  }
  return { steps: due, leftoverS: accumulatedS - due * stepS };
}

export function startLoop(onStep: () => void): () => void {
  let lastMs = performance.now();
  let accumulatedS = 0;
  const timer = setInterval(() => {
    const nowMs = performance.now();
    accumulatedS += (nowMs - lastMs) / 1000;
    lastMs = nowMs;
    const { steps, leftoverS } = planSteps(accumulatedS, STEP_S);
    for (let i = 0; i < steps; i++) onStep();
    accumulatedS = leftoverS;
  }, STEP_S * 1000);
  return () => clearInterval(timer);
}
