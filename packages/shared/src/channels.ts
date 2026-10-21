// Redis pub/sub channel names. One place, so a typo can't split the system in two.
export const channels = {
  heartbeat: "pendulums:heartbeat",
  control: "pendulums:control",
  position: (id: number) => `pendulums:${id}:position`,
  // For the gateway, which needs every position.
  allPositions: "pendulums:*:position",
} as const;
