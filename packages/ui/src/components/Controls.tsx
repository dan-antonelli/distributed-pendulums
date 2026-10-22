import { ConnectError } from "@connectrpc/connect";
import { useId, useState } from "react";
import type { PendulumView } from "@pendulums/shared";
import { useClient } from "../client";
import { type SystemState, pendingUpdates } from "../scene";
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
  const client = useClient();
  const hintId = useId();
  const [error, setError] = useState<string>();
  const blocked = enabled[state].includes("start") && pendingUpdates(drafts.drafts, pendulums).length > 0;

  async function run(action: Action) {
    setError(undefined);
    try {
      await client[action]({});
    } catch (e) {
      setError(ConnectError.from(e).rawMessage);
    }
  }

  const button = (action: Action, label: string) => (
    <button
      type="button"
      className={`control control--${action}`}
      disabled={!enabled[state].includes(action) || (action === "start" && blocked)}
      aria-describedby={action === "start" && blocked ? hintId : undefined}
      onClick={() => run(action)}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="controls">
        {button("start", state === "paused" ? "Resume" : "Start")}
        {button("pause", "Pause")}
        {button("stop", "Stop")}
        {blocked && (
          <p id={hintId} className="hint">
            Apply or reset your changes to start
          </p>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
