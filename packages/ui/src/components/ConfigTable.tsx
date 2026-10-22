import { ConnectError } from "@connectrpc/connect";
import { type PendulumView, PendulumPhase, limits } from "@pendulums/shared";
import { useState } from "react";
import { useClient } from "../client";
import { type Draft, type Range, anchorRangeOf, changeOf, draftOf, pendingUpdates, randomDrafts, readable } from "../scene";
import { type Drafts, applyInOrder } from "../useDrafts";

const phaseLabel: Record<PendulumPhase, string> = {
  [PendulumPhase.UNSPECIFIED]: "Unknown",
  [PendulumPhase.STOPPED]: "Stopped",
  [PendulumPhase.RUNNING]: "Running",
  [PendulumPhase.PAUSED]: "Paused",
  [PendulumPhase.HALTED]: "Halted",
  [PendulumPhase.READY]: "Ready",
  [PendulumPhase.WAITING]: "Waiting",
};

const fieldNames: [keyof Draft, string][] = [
  ["anchor", "Anchor"],
  ["length", "Length"],
  ["mass", "Mass"],
  ["angle", "Start angle"],
];

function Row({ pendulum, editable, anchorRange, drafts }: { pendulum: PendulumView; editable: boolean; anchorRange: Range; drafts: Drafts }) {
  const client = useClient();
  const saved = draftOf(pendulum);
  const draft =drafts.drafts[pendulum.id];
  const error = drafts.errors[pendulum.id];
  const setDraft = (next: Draft | undefined) => drafts.setDraft(pendulum.id, next);
  const setError = (next: string | undefined) => drafts.setError(pendulum.id, next);
  const shown = draft ?? saved;

  // While the box holds something that isn't a number yet (mid-typing), the slider shows the saved value.
  const field = (key: keyof Draft, label: string, range: Range, step: number) => {
    const update = (value: string) => setDraft({ ...shown, [key]: value });
    const sliderValue = Number.isFinite(Number.parseFloat(shown[key])) ? shown[key] : saved[key];
    return (
      <td className="col-middle">
        <div className="field column-block">
          <input
            aria-label={`${label}, pendulum ${pendulum.id}`}
            type="number"
            inputMode="decimal"
            min={range.min}
            max={range.max}
            step={step}
            value={shown[key]}
            disabled={!editable}
            onChange={(e) => update(e.target.value)}
          />
          <input
            aria-label={`${label}, pendulum ${pendulum.id}, slider`}
            type="range"
            min={range.min}
            max={range.max}
            step={step}
            value={sliderValue}
            disabled={!editable}
            onChange={(e) => update(e.target.value)}
          />
        </div>
      </td>
    );
  };

  async function apply() {
    if (!draft) return;
    setError(undefined);
    try {
      await client.updateConfig(changeOf(pendulum.id, draft, saved)!);
      setDraft(undefined);
    } catch (e) {
      setError(readable(ConnectError.from(e).rawMessage));
    }
  }

  const changed = draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved);
  const blank = draft && fieldNames.find(([key]) => draft[key].trim() === "" || !Number.isFinite(Number(draft[key])));
  const shownError = blank ? `${blank[1]} needs a number` : error;

  return (
    <>
      <tr>
        <th scope="row" className="col-edge">{pendulum.id}</th>
        {field("anchor", "Anchor position in meters", anchorRange, 0.05)}
        {field("length", "String length in meters", limits.lengthM, 0.05)}
        {field("mass", "Mass in kilograms", limits.massKg, 0.1)}
        {field("angle", "Starting angle in degrees", { min: -90, max: 90 }, 1)}
        <td className="col-middle phase">
          <span className="column-block">{phaseLabel[pendulum.phase]}</span>
        </td>
        <td className="col-edge">
          {/* Both always rendered, so the cell never changes shape. */}
          <div className="row-actions">
            <button type="button" aria-label={`Apply, pendulum ${pendulum.id}`} disabled={!editable || !changed || blank !== undefined} onClick={apply}>
              Apply
            </button>
            <button
              type="button"
              className="quiet"
              aria-label={`Reset, pendulum ${pendulum.id}`}
              disabled={!changed}
              onClick={() => (setDraft(undefined), setError(undefined))}
            >
              Reset
            </button>
          </div>
        </td>
      </tr>
      {shownError && (
        <tr className="row-error">
          <td colSpan={7} role="alert">
            Pendulum {pendulum.id}: {shownError}
          </td>
        </tr>
      )}
    </>
  );
}

export function ConfigTable({ pendulums, editable, drafts }: { pendulums: PendulumView[]; editable: boolean; drafts: Drafts }) {
  const client = useClient();
  const anchorRange = anchorRangeOf(pendulums);
  const [configError, setConfigError] = useState<string>();
  const [randomizing, setRandomizing] = useState(false);

  async function resetToDefaults() {
    setConfigError(undefined);
    try {
      await client.resetConfig({});
      drafts.clearAll();
    } catch (e) {
      setConfigError(ConnectError.from(e).rawMessage);
    }
  }

  async function randomize() {
    const random = randomDrafts(pendulums, Math.random);
    if (!random) {
      setConfigError("Couldn't find a valid random configuration. Try again.");
      return;
    }
    setConfigError(undefined);
    const updates = pendingUpdates(random, pendulums);
    drafts.replaceAll(Object.fromEntries(updates.map((u) => [u.id, random[u.id]!])));
    setRandomizing(true);
    try {
      await applyInOrder(client, drafts, updates);
    } finally {
      setRandomizing(false);
    }
  }

  return (
    <section className="config" aria-labelledby="config-title">
      <div className="config-head">
        <h2 id="config-title">Configuration</h2>
        {!editable && <p className="hint">Stop the simulation to change settings.</p>}
        <div className="config-actions">
          <button type="button" disabled={!editable || randomizing} onClick={randomize}>
            Randomize
          </button>
          <button type="button" disabled={!editable} onClick={resetToDefaults}>
            Reset to defaults
          </button>
        </div>
      </div>
      {configError && (
        <p className="error" role="alert">
          {configError}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" className="col-edge">#</th>
              <th scope="col" className="col-middle">
                <span className="column-block">Anchor (m)</span>
              </th>
              <th scope="col" className="col-middle">
                <span className="column-block">Length (m)</span>
              </th>
              <th scope="col" className="col-middle">
                <span className="column-block">Mass (kg)</span>
              </th>
              <th scope="col" className="col-middle">
                <span className="column-block">Start angle (°)</span>
              </th>
              <th scope="col" className="col-middle">
                <span className="column-block">State</span>
              </th>
              <th scope="col" className="col-edge">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pendulums
              .filter((p) => p.config)
              .map((p) => (
                <Row key={p.id} pendulum={p} editable={editable} anchorRange={anchorRange} drafts={drafts} />
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
