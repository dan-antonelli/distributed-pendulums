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

function Row({ pendulum, editable }: { pendulum: PendulumView; editable: boolean }) {
  const saved = draftOf(pendulum);
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState<string>();
  const shown = draft ?? saved;

  const field = (key: keyof Draft, label: string, min: number, max: number, step: number) => (
    <td>
      <input
        aria-label={`${label}, pendulum ${pendulum.id}`}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={shown[key]}
        disabled={!editable}
        onChange={(e) => setDraft({ ...shown, [key]: e.target.value })}
      />
    </td>
  );

  async function apply() {
    if (!draft) return;
    setError(undefined);
    try {
      // Send only what changed: the API merges partial updates (DECISIONS D13).
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
        {field("anchor", "Anchor position in meters", -50, 50, 0.1)}
        {field("length", "String length in meters", limits.lengthM.min, limits.lengthM.max, 0.1)}
        {field("mass", "Mass in kilograms", limits.massKg.min, limits.massKg.max, 0.1)}
        {field("angle", "Starting angle in degrees", -90, 90, 1)}
        <td className="phase">{phaseLabel[pendulum.phase]}</td>
        <td className="row-actions">
          <button type="button" disabled={!editable || !changed} onClick={apply}>
            Apply
          </button>
          {changed && (
            <button type="button" className="quiet" onClick={() => (setDraft(undefined), setError(undefined))}>
              Reset
            </button>
          )}
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

export function ConfigTable({ pendulums, editable }: { pendulums: PendulumView[]; editable: boolean }) {
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
                <Row key={p.id} pendulum={p} editable={editable} />
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
