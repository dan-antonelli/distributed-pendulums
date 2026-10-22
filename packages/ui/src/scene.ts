import { create } from "@bufbuild/protobuf";
import {
  type PendulumConfig,
  PendulumConfigSchema,
  PendulumPhase,
  type PendulumView,
  bobRadiusM,
  firstOverlap,
  limits,
  validateConfig,
} from "@pendulums/shared";

const { STOPPED, RUNNING, PAUSED, HALTED, READY, WAITING } = PendulumPhase;

export type SystemState = "empty" | "stopped" | "running" | "paused" | "collision";

export function systemState(pendulums: PendulumView[]): SystemState {
  if (pendulums.length === 0) return "empty";
  const phases = new Set(pendulums.map((p) => p.phase));
  if ([HALTED, READY, WAITING].some((phase) => phases.has(phase))) return "collision";
  if (phases.has(RUNNING)) return "running";
  if (phases.has(PAUSED)) return "paused";
  return "stopped";
}

export interface Draft {
  anchor: string;
  length: string;
  mass: string;
  angle: string;
}

export interface ConfigChange {
  id: number;
  anchorXM?: number;
  lengthM?: number;
  massKg?: number;
  initialAngleRad?: number;
}

const degrees = (rad: number) => Math.round((rad * 180) / Math.PI);
const radians = (deg: number) => (deg * Math.PI) / 180;
const round = (value: number) => String(Math.round(value * 100) / 100);

export function draftOf(p: PendulumView): Draft {
  const c = p.config!;
  return { anchor: round(c.anchorXM), length: round(c.lengthM), mass: round(c.massKg), angle: String(degrees(c.initialAngleRad)) };
}

export function changeOf(id: number, draft: Draft, saved: Draft): ConfigChange | undefined {
  const change: ConfigChange = {
    id,
    ...(draft.anchor !== saved.anchor && { anchorXM: Number(draft.anchor) }),
    ...(draft.length !== saved.length && { lengthM: Number(draft.length) }),
    ...(draft.mass !== saved.mass && { massKg: Number(draft.mass) }),
    ...(draft.angle !== saved.angle && { initialAngleRad: radians(Number(draft.angle)) }),
  };
  return Object.keys(change).length > 1 ? change : undefined;
}

const byId = (pendulums: PendulumView[]) => [...pendulums].sort((a, b) => a.id - b.id);

export function pendingUpdates(drafts: Record<number, Draft>, pendulums: PendulumView[]): ConfigChange[] {
  return byId(pendulums).flatMap((p) => {
    const draft = drafts[p.id];
    const change = draft && p.config ? changeOf(p.id, draft, draftOf(p)) : undefined;
    return change ? [change] : [];
  });
}

export function readable(message: string): string {
  return message
    .replace(/initial_angle_rad must be between [^;]+/, "Start angle must be between -90° and 90°")
    .replace("anchor_x_m", "Anchor")
    .replace("length_m", "Length")
    .replace("mass_kg", "Mass");
}

export interface Range {
  min: number;
  max: number;
}

// Computed from the saved configs, so the slider doesn't jump while dragging. The box accepts any position.
export function anchorRangeOf(pendulums: PendulumView[]): Range {
  const anchors = pendulums.flatMap((p) => (p.config ? [p.config.anchorXM] : []));
  if (anchors.length === 0) return { min: 0, max: 5 };
  const { min, max } = limits.anchorXM;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  return { min: clamp(Math.floor(Math.min(...anchors) - 2)), max: clamp(Math.ceil(Math.max(...anchors) + 2)) };
}

const pick = (random: () => number, range: Range, step: number) =>
  range.min + Math.floor(random() * (Math.round((range.max - range.min) / step) + 1)) * step;

const configOf = (draft: Draft) =>
  create(PendulumConfigSchema, {
    anchorXM: Number(draft.anchor),
    lengthM: Number(draft.length),
    massKg: Number(draft.mass),
    initialAngleRad: radians(Number(draft.angle)),
  });

// Randomize applies rows one at a time in id order and the gateway checks each against the configs it has then,
// so every intermediate state must be overlap-free, not just the final one.
function appliesInOrder(rows: PendulumView[], drafts: Record<number, Draft>): boolean {
  const configs = new Map<number, PendulumConfig>(rows.map((p) => [p.id, p.config!]));
  for (const p of rows) {
    const next = configOf(drafts[p.id]!);
    if (validateConfig(next).length > 0 || firstOverlap(p.id, next, configs) !== undefined) return false;
    configs.set(p.id, next);
  }
  return true;
}

export function randomDrafts(
  pendulums: PendulumView[],
  random: () => number,
  attempts = 50,
): Record<number, Draft> | undefined {
  const rows = byId(pendulums).filter((p) => p.config);
  const anchors = anchorRangeOf(pendulums);
  const angles = { min: degrees(limits.angleRad.min), max: degrees(limits.angleRad.max) };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const drafts: Record<number, Draft> = {};
    for (const p of rows) {
      drafts[p.id] = {
        anchor: round(pick(random, anchors, 0.05)),
        length: round(pick(random, limits.lengthM, 0.05)),
        mass: round(pick(random, limits.massKg, 0.1)),
        angle: String(pick(random, angles, 1)),
      };
    }
    if (appliesInOrder(rows, drafts)) return drafts;
  }
  return undefined;
}

export const isEditable = (pendulums: PendulumView[]) => pendulums.every((p) => p.phase === STOPPED);

export function restartCountdownS(pendulums: PendulumView[]): number | undefined {
  const waiting = pendulums.filter((p) => p.phase === WAITING);
  if (waiting.length === 0) return undefined;
  return Math.max(...waiting.map((p) => p.restartInMs)) / 1000;
}

const SIDE_MARGIN_M = 0.15;
const BOTTOM_MARGIN_M = 0.1;
const TOP_M = 0.3;

// A frictionless pendulum never swings wider than its starting angle, so sideways reach is
// length × sin(starting angle), not its full length. Its lowest point is straight down.
export function swingFrame(pendulums: PendulumView[]) {
  const configs = pendulums.flatMap((p) => (p.config ? [p.config] : []));
  if (configs.length === 0) return { xM: -SIDE_MARGIN_M, yM: -TOP_M, widthM: 2 + 2 * SIDE_MARGIN_M, heightM: 1 + TOP_M };

  const reach = configs.map((c) => {
    const radiusM = bobRadiusM(c.massKg);
    const sidewaysM = c.lengthM * Math.sin(Math.min(Math.abs(c.initialAngleRad), Math.PI / 2)) + radiusM;
    return { left: c.anchorXM - sidewaysM, right: c.anchorXM + sidewaysM, bottom: c.lengthM + radiusM };
  });
  const left = Math.min(...reach.map((r) => r.left)) - SIDE_MARGIN_M;
  const right = Math.max(...reach.map((r) => r.right)) + SIDE_MARGIN_M;
  const bottom = Math.max(...reach.map((r) => r.bottom)) + BOTTOM_MARGIN_M;
  return { xM: left, yM: -TOP_M, widthM: right - left, heightM: bottom + TOP_M };
}
