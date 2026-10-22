import { type MessageInitShape, create } from "@bufbuild/protobuf";
import {
  type Bus,
  type BusMessage,
  BusMessageSchema,
  CommandType,
  PendulumConfigSchema,
  PendulumPhase,
  channels,
} from "@pendulums/shared";

export const config = (anchorXM: number, initialAngleRad = 0, lengthM = 1, massKg = 1) =>
  create(PendulumConfigSchema, { anchorXM, lengthM, massKg, initialAngleRad });

const message = (body: MessageInitShape<typeof BusMessageSchema>["body"]) => create(BusMessageSchema, { body });

export function actAs(bus: Bus) {
  return {
    heartbeat: (id: number, phase = PendulumPhase.RUNNING, cycle = 0) =>
      bus.publish(channels.heartbeat, message({ case: "heartbeat", value: { id, config: config(id * 10), phase, cycle } })),
    stop: (fromId: number, cycle: number) =>
      bus.publish(channels.control, message({ case: "stop", value: { fromId, cycle, hitId: 0 } })),
    restart: (fromId: number, cycle: number) =>
      bus.publish(channels.control, message({ case: "restart", value: { fromId, cycle } })),
    ready: (fromId: number, cycle: number) =>
      bus.publish(channels.control, message({ case: "ready", value: { fromId, cycle } })),
    command: (type: CommandType) => bus.publish(channels.control, message({ case: "command", value: { type } })),
    configUpdate: (id: number, newConfig: ReturnType<typeof config>) =>
      bus.publish(channels.control, message({ case: "configUpdate", value: { id, config: newConfig } })),
  };
}

export const isStop = (m: BusMessage) => m.body.case === "stop";
export const isRestartFrom = (id: number) => (m: BusMessage) => m.body.case === "restart" && m.body.value.fromId === id;
