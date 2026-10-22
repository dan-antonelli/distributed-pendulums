import { ConnectError } from "@connectrpc/connect";
import { type PendulumView, PendulumPhase, limits } from "@pendulums/shared";
import { useState } from "react";
import { client } from "../client";

const degrees = (rad: number) => Math.round((rad * 180) / Math.PI);
const radians = (deg: number) => (deg * Math.PI) / 180;
const round = (value: number) => String(Math.round(value * 100) / 100);

// The API speaks in field names and radians; the form speaks in labels and degrees.
function readable(message: string): string {
  return message
    .replace(/initial_angle_rad must be between [^;]+/, "Start angle must be between -90° and 90°")
    .replace("anchor_x_m", "Anchor")
    .replace("length_m", "Length")
    .replace("mass_kg", "Mass");
}

const phaseLabel: Record<PendulumPhase, string> = {
  [PendulumPhase.UNSPECIFIED]: "Unknown",
  [PendulumPhase.STOPPED]: "Stopped",
  [PendulumPhase.RUNNING]: "Running",
  [PendulumPhase.PAUSED]: "Paused",
  [PendulumPhase.HALTED]: "Halted",
  [PendulumPhase.READY]: "Ready",
  [PendulumPhase.WAITING]: "Waiting",
};

interface Draft {
  anchor: string;
  length: string;
  mass: string;
  angle: string;
}

function draftOf(p: PendulumView): Draft {
  const c = p.config!;
  return { anchor: round(c.anchorXM), length: round(c.lengthM), mass: round(c.massKg), angle: String(degrees(c.initialAngleRad)) };
}

interface Range {
  min: number;
  max: number;
}

function Row({ pendulum, editable, anchorRange }: { pendulum: PendulumView; editable: boolean; anchorRange: Range }) {
  const saved = draftOf(pendulum);
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState<string>();
  const shown = draft ?? saved;

  // A box for an exact value, with a slider under it for quick adjustment, both editing the same draft.
  // While the box holds something that isn't a number yet (mid-typing), the slider shows the saved value.
  const field = (key: keyof Draft, label: string, range: Range, step: number) => {
    const update = (value: string) => setDraft({ ...shown, [key]: value });
    const sliderValue = Number.isFinite(Number.parseFloat(shown[key])) ? shown[key] : saved[key];
    return (
      <td>
        <div className="field">
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
      // Send only what changed: the API merges partial updates.
      await client.updateConfig({
        id: pendulum.id,
        ...(draft.anchor !== saved.anchor && { anchorXM: Number(draft.anchor) }),
        ...(draft.length !== saved.length && { lengthM: Number(draft.length) }),
        ...(draft.mass !== saved.mass && { massKg: Number(draft.mass) }),
        ...(draft.angle !== saved.angle && { initialAngleRad: radians(Number(draft.angle)) }),
      });
      setDraft(undefined);
    } catch (e) {
      setError(readable(ConnectError.from(e).rawMessage));
    }
  }

  const changed = draft !== undefined && JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <>
      <tr>
        <th scope="row">{pendulum.id}</th>
        {field("anchor", "Anchor position in meters", anchorRange, 0.05)}
        {field("length", "String length in meters", limits.lengthM, 0.05)}
        {field("mass", "Mass in kilograms", limits.massKg, 0.1)}
        {field("angle", "Starting angle in degrees", { min: -90, max: 90 }, 1)}
        <td className="phase">{phaseLabel[pendulum.phase]}</td>
        <td>
          <div className="row-actions">
            <button type="button" disabled={!editable || !changed} onClick={apply}>
              Apply
            </button>
            {/* Always rendered, only hidden: if it came and went, the table would re-measure its columns
                and everything would jump each time a slider crossed the saved value. */}
            <button
              type="button"
              className={changed ? "quiet" : "quiet is-hidden"}
              disabled={!changed}
              aria-hidden={!changed}
              tabIndex={changed ? 0 : -1}
              onClick={() => (setDraft(undefined), setError(undefined))}
            >
              Reset
            </button>
          </div>
        </td>
      </tr>
      {error && (
        <tr className="row-error">
          <td colSpan={7} role="alert">
            Pendulum {pendulum.id}: {error}
          </td>
        </tr>
      )}
    </>
  );
}

// The anchor slider spans the array plus 2 m on each side, from the saved configs, so it doesn't jump while dragging.
// The box still accepts any position further out.
function anchorRangeOf(pendulums: PendulumView[]): Range {
  const anchors = pendulums.flatMap((p) => (p.config ? [p.config.anchorXM] : []));
  if (anchors.length === 0) return { min: 0, max: 5 };
  return { min: Math.floor(Math.min(...anchors) - 2), max: Math.ceil(Math.max(...anchors) + 2) };
}

export function ConfigTable({ pendulums, editable }: { pendulums: PendulumView[]; editable: boolean }) {
  const anchorRange = anchorRangeOf(pendulums);
  return (
    <section className="config" aria-labelledby="config-title">
      <div className="config-head">
        <h2 id="config-title">Configuration</h2>
        {!editable && <p className="hint">Stop the simulation to change settings.</p>}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Anchor (m)</th>
              <th scope="col">Length (m)</th>
              <th scope="col">Mass (kg)</th>
              <th scope="col">Start angle (°)</th>
              <th scope="col">State</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pendulums
              .filter((p) => p.config)
              .map((p) => (
                <Row key={p.id} pendulum={p} editable={editable} anchorRange={anchorRange} />
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
