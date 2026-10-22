import { gatewayUrl } from "./client";
import { ConfigTable } from "./components/ConfigTable";
import { Controls } from "./components/Controls";
import { Stage } from "./components/Stage";
import { isEditable, systemState } from "./scene";
import { useDrafts } from "./useDrafts";
import { type Connection, usePendulums } from "./usePendulums";

const connectionLabel: Record<Connection, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Gateway unreachable, retrying",
};

export function App() {
  const { pendulums, connection } = usePendulums();
  const drafts = useDrafts();
  const state = systemState(pendulums);

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>Distributed pendulums</h1>
          <p className={`connection connection--${connection}`}>
            {connectionLabel[connection]}
            {connection === "live" && `, ${pendulums.length} ${pendulums.length === 1 ? "server" : "servers"}`}
          </p>
        </div>
        <Controls state={state} pendulums={pendulums} drafts={drafts} />
      </header>

      {connection === "reconnecting" && pendulums.length === 0 ? (
        <p className="empty">
          Can't reach the gateway at {gatewayUrl}. Check that it's running; this page reconnects on its own.
        </p>
      ) : state === "empty" ? (
        <p className="empty">No pendulum servers are running yet. They appear here as soon as they start.</p>
      ) : (
        <>
          <Stage pendulums={pendulums} />
          <ConfigTable pendulums={pendulums} editable={isEditable(pendulums)} drafts={drafts} />
        </>
      )}
    </main>
  );
}
