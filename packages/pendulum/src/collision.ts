import { type Bob, type PendulumConfig, bobRadiusM, isTouching } from "@pendulums/shared";

// A bob is never further from its anchor than its string length.
// So if the anchors are further apart than both strings plus both radii, the bobs can never touch (DECISIONS D4).
export function canReach(a: PendulumConfig, b: PendulumConfig): boolean {
  const maxReachM = a.lengthM + b.lengthM + bobRadiusM(a.massKg) + bobRadiusM(b.massKg);
  return Math.abs(a.anchorXM - b.anchorXM) < maxReachM;
}

export function neighborsWithinReach(
  selfId: number,
  self: PendulumConfig,
  peers: ReadonlyMap<number, PendulumConfig>,
): number[] {
  return [...peers]
    .filter(([id, config]) => id !== selfId && canReach(self, config))
    .map(([id]) => id)
    .sort((a, b) => a - b);
}

export function touchingIds(self: Bob, others: ReadonlyMap<number, Bob>): Set<number> {
  return new Set([...others].filter(([, bob]) => isTouching(self, bob)).map(([id]) => id));
}

// A collision counts only at the moment two bobs go from apart to touching.
// Otherwise two bobs that stay overlapping would report a collision every tick (DECISIONS D11).
export function newContacts(before: ReadonlySet<number>, now: ReadonlySet<number>): number[] {
  return [...now].filter((id) => !before.has(id)).sort((a, b) => a - b);
}
