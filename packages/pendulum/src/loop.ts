import { STEP_S } from "./physics";

// After a long freeze, run at most this many steps at once and drop the rest (DECISIONS D7).
export const MAX_STEPS_PER_TICK = 5;

// Pure: given how much time has piled up, how many fixed steps to run and how much time to carry over.
export function planSteps(accumulatedS: number, stepS: number): { steps: number; leftoverS: number } {
  const due = Math.floor(accumulatedS / stepS);
  if (due > MAX_STEPS_PER_TICK) {
    // Too far behind. Catching up fully would take long enough to fall behind again (the "spiral of death").
    return { steps: MAX_STEPS_PER_TICK, leftoverS: 0 };
  }
  return { steps: due, leftoverS: accumulatedS - due * stepS };
}

// Fixed-step loop: physics always advances by exactly STEP_S, however late the timer fires.
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
