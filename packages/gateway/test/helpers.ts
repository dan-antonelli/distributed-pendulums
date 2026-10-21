import { create } from "@bufbuild/protobuf";
import { type Bus, type BusMessage, BusMessageSchema, PendulumConfigSchema, PendulumPhase } from "@pendulums/shared";

export const config = (anchorXM: number, initialAngleRad = 0, lengthM = 1, massKg = 1) =>
  create(PendulumConfigSchema, { anchorXM, lengthM, massKg, initialAngleRad });

export const heartbeat = (id: number, phase = PendulumPhase.STOPPED, pendulumConfig = config(id)) =>
  create(BusMessageSchema, { body: { case: "heartbeat", value: { id, config: pendulumConfig, phase, cycle: 0 } } });

export const position = (id: number, bobXM: number, bobYM: number, phase = PendulumPhase.RUNNING) =>
  create(BusMessageSchema, { body: { case: "position", value: { id, bobXM, bobYM, phase } } });

// Records what the gateway publishes, so tests can check it.
export function recordingBus(): Bus & { published: BusMessage[] } {
  const published: BusMessage[] = [];
  return {
    published,
    publish: (_channel, message) => published.push(message),
    subscribe: () => {},
    unsubscribe: () => {},
    subscribePattern: () => {},
  };
}
