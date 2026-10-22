import { useState } from "react";
import type { Draft } from "./scene";

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
