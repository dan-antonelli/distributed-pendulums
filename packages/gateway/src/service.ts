import { setTimeout as sleep } from "node:timers/promises";
import { type MessageInitShape, create } from "@bufbuild/protobuf";
import { Code, ConnectError, type ConnectRouter, type ServiceImpl } from "@connectrpc/connect";
import {
  type Bus,
  BusMessageSchema,
  CommandType,
  type PendulumConfig,
  PendulumConfigSchema,
  PendulumPhase,
  SimulationService,
  channels,
  isTouching,
  startingBob,
  validateConfig,
} from "@pendulums/shared";
import type { SystemView } from "./view";

export const SNAPSHOT_INTERVAL_MS = 50;

export function simulationService(bus: Bus, view: SystemView): ServiceImpl<typeof SimulationService> {
  // Awaited, so a command never reports success while Redis is down.
  const broadcast = async (body: MessageInitShape<typeof BusMessageSchema>["body"]) => {
    try {
      await bus.publish(channels.control, create(BusMessageSchema, { body }));
    } catch {
      throw new ConnectError("the message bus is unavailable, try again shortly", Code.Unavailable);
    }
  };
  const command = async (type: CommandType) => {
    await broadcast({ case: "command", value: { type } });
    return {};
  };

  return {
    async *watchPendulums(_request, context) {
      try {
        while (true) {
          yield { pendulums: view.snapshot() };
          // A hand-written abortable sleep leaked a listener per snapshot.
          await sleep(SNAPSHOT_INTERVAL_MS, undefined, { signal: context.signal });
        }
      } catch (error) {
        if (!context.signal.aborted) throw error;
      }
    },

    async updateConfig(request) {
      const current = view.get(request.id);
      if (!current?.config) throw new ConnectError(`no pendulum with id ${request.id}`, Code.NotFound);
      // Best effort: the view can be a moment old, so the pendulum server has the final say.
      if (current.phase !== PendulumPhase.STOPPED) {
        throw new ConnectError("stop the simulation before changing a pendulum", Code.FailedPrecondition);
      }

      const config = create(PendulumConfigSchema, {
        anchorXM: request.anchorXM ?? current.config.anchorXM,
        lengthM: request.lengthM ?? current.config.lengthM,
        massKg: request.massKg ?? current.config.massKg,
        initialAngleRad: request.initialAngleRad ?? current.config.initialAngleRad,
      });

      const problems = validateConfig(config);
      if (problems.length === 0) {
        const overlapping = firstOverlap(request.id, config, view.configs());
        if (overlapping !== undefined) problems.push(`its bob would start touching pendulum ${overlapping}`);
      }
      if (problems.length > 0) throw new ConnectError(problems.join("; "), Code.InvalidArgument);

      await broadcast({ case: "configUpdate", value: { id: request.id, config } });
      view.rememberSentConfig(request.id, config);
      return {};
    },

    async resetConfig() {
      if (view.snapshot().some((p) => p.phase !== PendulumPhase.STOPPED)) {
        throw new ConnectError("stop the simulation before resetting the pendulums", Code.FailedPrecondition);
      }
      return command(CommandType.RESET_CONFIG);
    },

    start: () => command(CommandType.START),
    pause: () => command(CommandType.PAUSE),
    stop: () => command(CommandType.STOP),
  };
}

export const routes = (bus: Bus, view: SystemView) => (router: ConnectRouter) =>
  router.service(SimulationService, simulationService(bus, view));

// Starting overlapped would fire a collision the instant the user presses start.
function firstOverlap(id: number, config: PendulumConfig, others: Map<number, PendulumConfig>): number | undefined {
  const bob = startingBob(config);
  for (const [otherId, other] of others) {
    if (otherId !== id && isTouching(bob, startingBob(other))) return otherId;
  }
  return undefined;
}
