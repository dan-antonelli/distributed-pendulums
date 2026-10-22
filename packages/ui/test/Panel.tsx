import type { PendulumView } from "@pendulums/shared";
import { ConfigTable } from "../src/components/ConfigTable";
import { Controls } from "../src/components/Controls";
import { isEditable, systemState } from "../src/scene";
import { useDrafts } from "../src/useDrafts";

export function Panel({ pendulums }: { pendulums: PendulumView[] }) {
  const drafts = useDrafts();
  return (
    <>
      <Controls state={systemState(pendulums)} pendulums={pendulums} drafts={drafts} />
      <ConfigTable pendulums={pendulums} editable={isEditable(pendulums)} drafts={drafts} />
    </>
  );
}
