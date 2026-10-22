import { type PendulumView, PendulumPhase, bobRadiusM } from "@pendulums/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { restartCountdownS, swingFrame, systemState } from "../scene";

const { RUNNING, PAUSED, HALTED, READY, WAITING } = PendulumPhase;
const IN_CYCLE = new Set([HALTED, READY, WAITING]);

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];
// Room for a horizontal scrollbar, so it never forces a vertical one at 100%.
const SCROLLBAR_ALLOWANCE_PX = 14;
export const MAX_GRID_LINES = 200;
const GRID_STEP_M = 0.5;

const gridStepM = (spanM: number) => GRID_STEP_M * Math.max(1, Math.ceil(spanM / GRID_STEP_M / MAX_GRID_LINES));

function bobClass(phase: PendulumPhase): string {
  if (IN_CYCLE.has(phase)) return "bob bob--cycle";
  if (phase === RUNNING) return "bob bob--running";
  if (phase === PAUSED) return "bob bob--paused";
  return "bob";
}

function statusText(pendulums: PendulumView[]): string {
  switch (systemState(pendulums)) {
    case "collision": {
      const countdown = restartCountdownS(pendulums);
      return countdown === undefined
        ? "Collision. Waiting for every pendulum to confirm"
        : `Collision. Restarting in ${countdown.toFixed(1)} s`;
    }
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    default:
      return "Stopped";
  }
}

function useBoxHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setHeight(box.offsetHeight));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return { ref, height };
}

export function Stage({ pendulums }: { pendulums: PendulumView[] }) {
  const { ref, height } = useBoxHeight();
  const [zoomStep, setZoomStep] = useState(ZOOM_STEPS.indexOf(1));
  const zoom = ZOOM_STEPS[zoomStep]!;

  const frame = swingFrame(pendulums);
  const pxPerM = (Math.max(height - SCROLLBAR_ALLOWANCE_PX, 0) / frame.heightM) * zoom;
  const inCycle = systemState(pendulums) === "collision";

  const stepXM = gridStepM(frame.widthM);
  const gridXs = [];
  for (let x = Math.ceil(frame.xM / stepXM) * stepXM; x < frame.xM + frame.widthM; x += stepXM) gridXs.push(x);
  const stepYM = gridStepM(frame.heightM);
  const gridYs = [];
  for (let y = stepYM; y < frame.yM + frame.heightM; y += stepYM) gridYs.push(y);

  return (
    <div className="stage">
      <div className={inCycle ? "stage__bar stage__bar--hazard" : "stage__bar"}>
        <p className="stage__status" role="status">
          <span>{statusText(pendulums)}</span>
        </p>
        <div className="zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={zoomStep === 0} onClick={() => setZoomStep(zoomStep - 1)}>
            −
          </button>
          <button type="button" aria-label="Fit to the box" title="Fit to the box" onClick={() => setZoomStep(ZOOM_STEPS.indexOf(1))}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoomStep === ZOOM_STEPS.length - 1}
            onClick={() => setZoomStep(zoomStep + 1)}
          >
            +
          </button>
        </div>
      </div>
      <div ref={ref} className={zoom > 1 ? "stage__box stage__box--zoomed" : "stage__box"} tabIndex={0} role="region" aria-label="Pendulum stage">
        {height > 0 && (
          <svg
            width={frame.widthM * pxPerM}
            height={frame.heightM * pxPerM}
            viewBox={`${frame.xM} ${frame.yM} ${frame.widthM} ${frame.heightM}`}
            role="img"
            aria-label={`${pendulums.length} pendulums`}
          >
            <g className="grid">
              {gridXs.map((x) => (
                <line key={`x${x}`} x1={x} y1={0} x2={x} y2={frame.yM + frame.heightM} />
              ))}
              {gridYs.map((y) => (
                <line key={`y${y}`} x1={frame.xM} y1={y} x2={frame.xM + frame.widthM} y2={y} />
              ))}
            </g>
            <line className={inCycle ? "beam beam--cycle" : "beam"} x1={frame.xM} y1={0} x2={frame.xM + frame.widthM} y2={0} />
            {pendulums.map((p) => {
              const anchorXM = p.config?.anchorXM ?? 0;
              return (
                <g key={p.id}>
                  <text className="tag" x={anchorXM} y={-0.12}>
                    {p.id}
                  </text>
                  <line className="string" x1={anchorXM} y1={0} x2={p.bobXM} y2={p.bobYM} />
                  <circle className="pivot" cx={anchorXM} cy={0} r={0.025} />
                  <circle className={bobClass(p.phase)} cx={p.bobXM} cy={p.bobYM} r={bobRadiusM(p.config?.massKg ?? 1)} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
