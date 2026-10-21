import { Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { CommandType, PendulumPhase, SimulationService } from "@pendulums/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { routes } from "../src/service";
import { SystemView } from "../src/view";
import { config, heartbeat, recordingBus } from "./helpers";

// The real service, called through Connect's in-memory transport: no HTTP server, no Redis.
let bus: ReturnType<typeof recordingBus>;
let view: SystemView;
let client: ReturnType<typeof createClient<typeof SimulationService>>;

beforeEach(() => {
  bus = recordingBus();
  view = new SystemView();
  client = createClient(SimulationService, createRouterTransport(routes(bus, view)));
  view.onMessage(heartbeat(1, PendulumPhase.STOPPED, config(0)));
  view.onMessage(heartbeat(2, PendulumPhase.STOPPED, config(1)));
});

const lastPublished = () => bus.published.at(-1)?.body;

describe("commands", () => {
  test("start is broadcast to every pendulum as a START command", async () => {
    await client.start({});
    expect(lastPublished()).toMatchObject({ case: "command", value: { type: CommandType.START } });
  });
});

describe("updateConfig", () => {
  test("changes only the fields that were sent, and broadcasts the full config", async () => {
    await client.updateConfig({ id: 1, lengthM: 0.5 });
    expect(lastPublished()).toMatchObject({
      case: "configUpdate",
      value: { id: 1, config: { anchorXM: 0, lengthM: 0.5, massKg: 1, initialAngleRad: 0 } },
    });
  });

  test("an unknown pendulum is NOT_FOUND", async () => {
    await expect(client.updateConfig({ id: 9, lengthM: 0.5 })).rejects.toMatchObject({ code: Code.NotFound });
  });

  test("a running pendulum can't be changed: FAILED_PRECONDITION", async () => {
    view.onMessage(heartbeat(1, PendulumPhase.RUNNING, config(0)));
    await expect(client.updateConfig({ id: 1, lengthM: 0.5 })).rejects.toMatchObject({
      code: Code.FailedPrecondition,
    });
  });

  test("an invalid value is INVALID_ARGUMENT, with the reason, and nothing is broadcast", async () => {
    await expect(client.updateConfig({ id: 1, lengthM: -1 })).rejects.toMatchObject({
      code: Code.InvalidArgument,
      rawMessage: "length_m must be between 0.1 and 5",
    });
    expect(bus.published).toEqual([]);
  });

  test("a config whose bob would start on top of another bob is INVALID_ARGUMENT", async () => {
    await expect(client.updateConfig({ id: 1, anchorXM: 1.05 })).rejects.toMatchObject({
      code: Code.InvalidArgument,
      rawMessage: "its bob would start touching pendulum 2",
    });
  });
});

describe("watchPendulums", () => {
  test("streams snapshots of every live pendulum", async () => {
    const snapshots = [];
    for await (const snapshot of client.watchPendulums({})) {
      snapshots.push(snapshot);
      if (snapshots.length === 3) break;
    }
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]!.pendulums.map((p) => p.id)).toEqual([1, 2]);
  });
});
