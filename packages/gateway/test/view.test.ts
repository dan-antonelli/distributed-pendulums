import { PendulumPhase } from "@pendulums/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { STALE_AFTER_MS, SystemView } from "../src/view";
import { heartbeat, position } from "./helpers";

let view: SystemView;

beforeEach(() => {
  vi.useFakeTimers();
  view = new SystemView();
});

afterEach(() => vi.useRealTimers());

describe("SystemView", () => {
  test("a heartbeat adds a pendulum; positions keep its bob up to date", () => {
    view.onMessage(heartbeat(1));
    view.onMessage(position(1, 1.3, 0.9));

    const [pendulum] = view.snapshot();
    expect(pendulum).toMatchObject({ id: 1, bobXM: 1.3, bobYM: 0.9, phase: PendulumPhase.RUNNING });
  });

  test("a position from a pendulum we have no heartbeat for yet is ignored", () => {
    view.onMessage(position(7, 1, 1));
    expect(view.snapshot()).toEqual([]);
  });

  test("lists pendulums in id order", () => {
    view.onMessage(heartbeat(3));
    view.onMessage(heartbeat(1));
    expect(view.snapshot().map((p) => p.id)).toEqual([1, 3]);
  });

  test("a pendulum that goes silent disappears from the snapshot", () => {
    view.onMessage(heartbeat(1));
    view.onMessage(heartbeat(2));
    vi.advanceTimersByTime(STALE_AFTER_MS - 100);
    view.onMessage(heartbeat(2));

    vi.advanceTimersByTime(200);
    expect(view.snapshot().map((p) => p.id)).toEqual([2]);
  });
});
