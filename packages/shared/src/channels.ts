export const channels = {
  heartbeat: "pendulums:heartbeat",
  control: "pendulums:control",
  position: (id: number) => `pendulums:${id}:position`,
  allPositions: "pendulums:*:position",
} as const;
