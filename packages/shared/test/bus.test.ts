import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { expect, test } from "vitest";
import { BusMessageSchema, PendulumPhase } from "../src";

test("a bus message survives encode and decode, keeping its oneof case", () => {
  const sent = create(BusMessageSchema, {
    body: {
      case: "heartbeat",
      value: {
        id: 3,
        config: { anchorXM: 1.5, lengthM: 1, massKg: 2, initialAngleRad: 0.4 },
        phase: PendulumPhase.WAITING,
        cycle: 7,
        restartInMs: 1200,
      },
    },
  });

  const received = fromBinary(BusMessageSchema, toBinary(BusMessageSchema, sent));

  expect(received.body.case).toBe("heartbeat");
  expect(received).toEqual(sent);
});
