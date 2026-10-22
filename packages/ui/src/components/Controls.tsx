import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import type { PendulumView } from "@pendulums/shared";
import { client } from "../client";
import { type SystemState, pendingUpdates, readable } from "../scene";
import type { Drafts } from "../useDrafts";

type Action = "start" | "pause" | "stop";

const enabled: Record<SystemState, Action[]> = {
  empty: [],
  stopped: ["start"],
  running: ["pause", "stop"],
  paused: ["start", "stop"],
  collision: ["stop"],
};

export function Controls({ state, pendulums, drafts }: { state: SystemState; pendulums: PendulumView[]; drafts: Drafts }) {
  const [error, setError] = useState<string>();
  const [applying, setApplying] = useState(false);

  async function applyPending(): Promise<boolean> {
    for (const update of pendingUpdates(drafts.drafts, pendulums)) {
      drafts.setError(update.id, undefined);
      try {
        await client.updateConfig(update);
        drafts.setDraft(update.id, undefined);
      } catch (e) {
        drafts.setError(update.id, readable(ConnectError.from(e).rawMessage));
        return false;
      }
    }
    return true;
  }

  async function run(action: Action) {
    setError(undefined);
    try {
      if (action === "start") {
        setApplying(true);
        if (!(await applyPending())) return;
      }
      await client[action]({});
    } catch (e) {
      setError(ConnectError.from(e).rawMessage);
    } finally {
      setApplying(false);
    }
  }

  const button = (action: Action, label: string) => (
    <button
      type="button"
      className={`control control--${action}`}
      disabled={!enabled[state].includes(action) || (action === "start" && applying)}
      onClick={() => run(action)}
    >
      {label}
    </button>
  );

  return (
    <div className="controls">
      {button("start", state === "paused" ? "Resume" : "Start")}
      {button("pause", "Pause")}
      {button("stop", "Stop")}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
