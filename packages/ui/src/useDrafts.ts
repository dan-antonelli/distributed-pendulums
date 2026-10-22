import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import type { useClient } from "./client";
import { type ConfigChange, type Draft, readable } from "./scene";

type ById<T> = Record<number, T>;

function withEntry<T>(record: ById<T>, id: number, value: T | undefined): ById<T> {
  const next = { ...record };
  if (value === undefined) delete next[id];
  else next[id] = value;
  return next;
}

export function useDrafts() {
  const [drafts, setDrafts] = useState<ById<Draft>>({});
  const [errors, setErrors] = useState<ById<string>>({});
  return {
    drafts,
    errors,
    setDraft: (id: number, draft: Draft | undefined) => setDrafts((d) => withEntry(d, id, draft)),
    setError: (id: number, error: string | undefined) => setErrors((e) => withEntry(e, id, error)),
    replaceAll: (next: ById<Draft>) => {
      setDrafts(next);
      setErrors({});
    },
    clearAll: () => {
      setDrafts({});
      setErrors({});
    },
  };
}

export type Drafts = ReturnType<typeof useDrafts>;

export async function applyInOrder(client: ReturnType<typeof useClient>, drafts: Drafts, updates: ConfigChange[]): Promise<boolean> {
  for (const update of updates) {
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
