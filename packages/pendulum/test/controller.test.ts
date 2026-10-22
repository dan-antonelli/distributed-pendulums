import { CommandType, PendulumPhase } from "@pendulums/shared";
import { InMemoryBus } from "@pendulums/shared/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HEARTBEAT_INTERVAL_MS, PEER_TIMEOUT_MS, PendulumController, RESTART_DELAY_MS } from "../src/controller";
import { defaultConfig } from "../src/defaults";
import { actAs, config } from "./helpers";

const { STOPPED, RUNNING, HALTED, READY, WAITING } = PendulumPhase;

let controller: PendulumController;
let peers: ReturnType<typeof actAs>;

beforeEach(() => {
  vi.useFakeTimers();
  const bus = new InMemoryBus();
  controller = new PendulumController(1, config(0, 0.3), bus.connect("controller"));
  peers = actAs(bus.connect("test"));
  controller.start();
  peers.heartbeat(2);
  peers.heartbeat(3);
  peers.command(CommandType.START);
  vi.advanceTimersByTime(1);
});

afterEach(() => {
  controller.dispose();
  vi.useRealTimers();
});

const deliver = () => vi.advanceTimersByTime(1);

function haltInCycle1() {
  peers.stop(2, 1);
  deliver();
}

function finishCycle1() {
  haltInCycle1();
  peers.restart(2, 1);
  peers.restart(3, 1);
  peers.ready(2, 1);
  peers.ready(3, 1);
  deliver();
}

describe("joining a collision cycle", () => {
  test("a STOP halts the pendulum and starts the cycle", () => {
    haltInCycle1();
    expect(controller.phase).toBe(HALTED);
    expect(controller.cycle).toBe(1);
  });

  test("a second STOP for the same cycle changes nothing", () => {
    haltInCycle1();
    peers.restart(2, 1);
    deliver();
    peers.stop(3, 1);
    peers.restart(3, 1);
    deliver();
    // A restarted cycle would forget the RESTART from 2 and we'd still be halted.
    expect(controller.phase).toBe(READY);
  });

  test("a STOP from an old cycle is ignored", () => {
    finishCycle1();
    vi.advanceTimersByTime(RESTART_DELAY_MS);
    peers.stop(2, 1);
    deliver();
    expect(controller.phase).toBe(RUNNING);
  });

  test("a peer's heartbeat showing a newer cycle pulls in a server that missed the STOP", () => {
    peers.heartbeat(2, HALTED, 1);
    deliver();
    expect(controller.phase).toBe(HALTED);
    expect(controller.cycle).toBe(1);
  });
});

describe("catching up after a dropped connection", () => {
  test("a server that joined late still finishes once its peers have already restarted", () => {
    peers.heartbeat(2, WAITING, 1);
    deliver();
    expect(controller.phase).toBe(HALTED);

    peers.heartbeat(2, RUNNING, 1);
    peers.heartbeat(3, RUNNING, 1);
    deliver();
    expect(controller.phase).toBe(WAITING);

    vi.advanceTimersByTime(RESTART_DELAY_MS);
    expect(controller.phase).toBe(RUNNING);
  });

  test("a server that missed a whole cycle adopts it and restarts from its starting angle", () => {
    controller.tick(0.5);
    expect(controller.angleRad).not.toBe(0.3);

    peers.heartbeat(2, RUNNING, 3);
    deliver();
    expect(controller.cycle).toBe(3);
    expect(controller.angleRad).toBe(0.3);
    expect(controller.phase).toBe(RUNNING);
  });
});

describe("the two rounds", () => {
  test("READY is sent only after RESTART from every participant", () => {
    haltInCycle1();
    peers.restart(2, 1);
    deliver();
    expect(controller.phase).toBe(HALTED);

    peers.restart(3, 1);
    deliver();
    expect(controller.phase).toBe(READY);
  });

  test("the 5-second wait starts only after READY from every participant", () => {
    haltInCycle1();
    peers.restart(2, 1);
    peers.restart(3, 1);
    peers.ready(2, 1);
    deliver();
    expect(controller.phase).toBe(READY);

    peers.ready(3, 1);
    deliver();
    expect(controller.phase).toBe(WAITING);
  });

  test("after the wait, it restarts from the configured angle, not the collision spot", () => {
    finishCycle1();
    controller.tick(0.5);
    vi.advanceTimersByTime(RESTART_DELAY_MS - 10);
    expect(controller.phase).toBe(WAITING);

    vi.advanceTimersByTime(10);
    expect(controller.phase).toBe(RUNNING);
    expect(controller.angleRad).toBe(0.3);
  });

  test("a participant that goes silent is dropped after the timeout, and the cycle finishes without it", () => {
    const keepPeer2Alive = setInterval(() => peers.heartbeat(2, HALTED, 1), 200);
    haltInCycle1();
    peers.restart(2, 1);
    peers.ready(2, 1);
    deliver();
    expect(controller.phase).toBe(HALTED);

    // Silence is only checked on a heartbeat tick, hence the extra interval.
    vi.advanceTimersByTime(PEER_TIMEOUT_MS + HEARTBEAT_INTERVAL_MS);
    expect(controller.phase).toBe(WAITING);
    clearInterval(keepPeer2Alive);
  });
});

describe("user commands", () => {
  test("start and pause are ignored during a collision cycle", () => {
    haltInCycle1();
    peers.command(CommandType.PAUSE);
    peers.command(CommandType.START);
    deliver();
    expect(controller.phase).toBe(HALTED);
  });

  test("user stop during the wait cancels the restart", () => {
    finishCycle1();
    expect(controller.phase).toBe(WAITING);

    peers.command(CommandType.STOP);
    deliver();
    vi.advanceTimersByTime(RESTART_DELAY_MS * 2);
    expect(controller.phase).toBe(STOPPED);
  });

  test("a stopped pendulum ignores collision messages", () => {
    peers.command(CommandType.STOP);
    deliver();
    haltInCycle1();
    expect(controller.phase).toBe(STOPPED);
  });

  test("reset to defaults is ignored while running and applied while stopped", () => {
    peers.command(CommandType.RESET_CONFIG);
    deliver();
    controller.tick(0);
    expect(controller.angleRad).toBe(0.3);

    peers.command(CommandType.STOP);
    peers.command(CommandType.RESET_CONFIG);
    deliver();
    expect(controller.angleRad).toBe(defaultConfig(1).initialAngleRad);
  });

  test("a config change is ignored while running and applied while stopped", () => {
    peers.configUpdate(1, config(0, -0.4));
    deliver();
    controller.tick(0);
    expect(controller.angleRad).toBe(0.3);

    peers.command(CommandType.STOP);
    peers.configUpdate(1, config(0, -0.4));
    deliver();
    expect(controller.angleRad).toBe(-0.4);
  });
});
