import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
import { PendulumPhase, type PendulumView, PendulumViewSchema, SimulationService } from "@pendulums/shared";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { TransportContext } from "../src/client";

interface Call {
  method: string;
  request: Record<string, unknown>;
}

export function createFakeService() {
  const calls: Call[] = [];
  const failures = new Map<number, string>();
  let gate: Promise<void> | undefined;
  let latest: PendulumView[] = [];
  let version = 0;
  let wake: (() => void) | undefined;

  const record = (method: string, request: object) => {
    calls.push({ method, request: request as Record<string, unknown> });
  };

  const transport = createRouterTransport(({ service }) => {
    service(SimulationService, {
      async *watchPendulums(_request, context) {
        let seen = 0;
        while (!context.signal.aborted) {
          if (version > seen) {
            seen = version;
            yield { pendulums: latest };
          } else {
            await new Promise<void>((resolve) => {
              wake = resolve;
              context.signal.addEventListener("abort", () => resolve(), { once: true });
            });
          }
        }
      },
      async updateConfig(request) {
        record("updateConfig", request);
        await gate;
        const failure = failures.get(request.id);
        if (failure) throw new ConnectError(failure, Code.InvalidArgument);
        return {};
      },
      async resetConfig(request) {
        record("resetConfig", request);
        return {};
      },
      async start(request) {
        record("start", request);
        return {};
      },
      async pause(request) {
        record("pause", request);
        return {};
      },
      async stop(request) {
        record("stop", request);
        return {};
      },
    });
  });

  return {
    transport,
    calls,
    methods: () => calls.map((call) => call.method),
    push(pendulums: PendulumView[]) {
      latest = pendulums;
      version++;
      wake?.();
    },
    failUpdate(id: number, message: string) {
      failures.set(id, message);
    },
    holdUpdates() {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

export type FakeService = ReturnType<typeof createFakeService>;

export function view(
  id: number,
  { phase = PendulumPhase.STOPPED, lengthM = 1, restartInMs = 0 }: { phase?: PendulumPhase; lengthM?: number; restartInMs?: number } = {},
) {
  return create(PendulumViewSchema, {
    id,
    phase,
    restartInMs,
    config: { anchorXM: id, lengthM, massKg: 1, initialAngleRad: 0.5 },
    bobXM: id,
    bobYM: lengthM,
  });
}

export function renderWithTransport(ui: ReactElement, fake: FakeService) {
  return render(<TransportContext.Provider value={fake.transport}>{ui}</TransportContext.Provider>);
}
