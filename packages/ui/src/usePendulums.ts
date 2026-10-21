import type { PendulumView } from "@pendulums/shared";
import { useEffect, useState } from "react";
import { client } from "./client";

export type Connection = "connecting" | "live" | "reconnecting";

const MAX_RETRY_DELAY_MS = 8000;

// Holds the latest snapshot from the gateway's stream (DECISIONS D3, D15).
// Reconnects with a growing delay; every new stream starts with a full snapshot, so nothing is lost.
export function usePendulums() {
  const [pendulums, setPendulums] = useState<PendulumView[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    const abort = new AbortController();
    let retryDelayMs = 1000;

    async function listen() {
      while (!abort.signal.aborted) {
        try {
          for await (const snapshot of client.watchPendulums({}, { signal: abort.signal })) {
            setPendulums(snapshot.pendulums);
            setConnection("live");
            retryDelayMs = 1000;
          }
        } catch {
          // The stream broke, or the gateway isn't up yet. Fall through to the retry below.
        }
        if (abort.signal.aborted) return;
        setConnection("reconnecting");
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
      }
    }

    void listen();
    // Unmount (or Strict Mode's test unmount) closes the stream. No stream is ever left open.
    return () => abort.abort();
  }, []);

  return { pendulums, connection };
}
