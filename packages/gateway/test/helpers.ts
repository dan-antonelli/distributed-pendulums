import { create } from "@bufbuild/protobuf";
import { type Bus, type BusMessage, BusMessageSchema, PendulumConfigSchema, PendulumPhase } from "@pendulums/shared";

export const config = (anchorXM: number, initialAngleRad = 0, lengthM = 1, massKg = 1) =>
  create(PendulumConfigSchema, { anchorXM, lengthM, massKg, initialAngleRad });

export const heartbeat = (id: number, phase = PendulumPhase.STOPPED, pendulumConfig = config(id)) =>
  create(BusMessageSchema, { body: { case: "heartbeat", value: { id, config: pendulumConfig, phase, cycle: 0 } } });

export const position = (id: number, bobXM: number, bobYM: number, phase = PendulumPhase.RUNNING) =>
  create(BusMessageSchema, { body: { case: "position", value: { id, bobXM, bobYM, phase } } });

export function recordingBus(): Bus & { published: BusMessage[]; down: boolean } {
  const published: BusMessage[] = [];
  return {
    published,
    down: false,
    async publish(_channel, message) {
      if (this.down) throw new Error("connection refused");
      published.push(message);
    },
    subscribe: () => {},
    unsubscribe: () => {},
    subscribePattern: () => {},
  };
}
