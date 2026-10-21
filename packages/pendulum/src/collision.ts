import type { PendulumConfig } from "@pendulums/shared";

// Bob size grows with mass, as if every bob were a ball of the same material:
// 8 times the mass gives twice the radius (DECISIONS D11).
const RADIUS_M_PER_CUBE_ROOT_KG = 0.1;

export function bobRadiusM(massKg: number): number {
  return RADIUS_M_PER_CUBE_ROOT_KG * Math.cbrt(massKg);
}

export interface Bob {
  xM: number;
  yM: number;
  radiusM: number;
}

export function isTouching(a: Bob, b: Bob): boolean {
  return Math.hypot(a.xM - b.xM, a.yM - b.yM) < a.radiusM + b.radiusM;
}

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
