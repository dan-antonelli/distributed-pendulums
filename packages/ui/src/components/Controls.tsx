import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import { client } from "../client";
import type { SystemState } from "../scene";

type Action = "start" | "pause" | "stop";

const enabled: Record<SystemState, Action[]> = {
  empty: [],
  stopped: ["start"],
  running: ["pause", "stop"],
  paused: ["start", "stop"],
  collision: ["stop"],
};

export function Controls({ state }: { state: SystemState }) {
  const [error, setError] = useState<string>();

  async function run(action: Action) {
    setError(undefined);
    try {
      await client[action]({});
    } catch (e) {
      setError(ConnectError.from(e).rawMessage);
    }
  }

  const button = (action: Action, label: string) => (
    <button type="button" className={`control control--${action}`} disabled={!enabled[state].includes(action)} onClick={() => run(action)}>
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
