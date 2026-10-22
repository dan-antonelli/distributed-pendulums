import { type Bob, type PendulumConfig, bobRadiusM, isTouching } from "@pendulums/shared";

// A bob never gets further from its anchor than its string length, so anchors further apart
// than both strings plus both radii can never touch.
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

// Only the apart-to-touching moment counts, or overlapping bobs would report a collision every tick.
export function newContacts(before: ReadonlySet<number>, now: ReadonlySet<number>): number[] {
  return [...now].filter((id) => !before.has(id)).sort((a, b) => a - b);
}
