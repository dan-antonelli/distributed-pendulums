import { type PendulumView, PendulumPhase, bobRadiusM } from "@pendulums/shared";
import { restartCountdownS, sceneBounds, systemState } from "../scene";

const { RUNNING, PAUSED, HALTED, READY, WAITING } = PendulumPhase;
const IN_CYCLE = new Set([HALTED, READY, WAITING]);

function bobClass(phase: PendulumPhase): string {
  if (IN_CYCLE.has(phase)) return "bob bob--cycle";
  if (phase === RUNNING) return "bob bob--running";
  if (phase === PAUSED) return "bob bob--paused";
  return "bob";
}

function cycleMessage(pendulums: PendulumView[]): string {
  const countdown = restartCountdownS(pendulums);
  if (countdown !== undefined) return `Collision. Restarting in ${countdown.toFixed(1)} s`;
  return "Collision. Waiting for every pendulum to confirm";
}

// Everything is drawn in meters; the viewBox maps meters to the screen, so the drawing scales with the window.
export function Stage({ pendulums }: { pendulums: PendulumView[] }) {
  const bounds = sceneBounds(pendulums);
  const gridXs = [];
  for (let x = Math.ceil(bounds.xM * 2) / 2; x < bounds.xM + bounds.widthM; x += 0.5) gridXs.push(x);
  const gridYs = [];
  for (let y = 0.5; y < bounds.yM + bounds.heightM; y += 0.5) gridYs.push(y);
  const inCycle = systemState(pendulums) === "collision";

  return (
    <div className="stage">
      {inCycle && (
        <div className="hazard" role="status">
          <span>{cycleMessage(pendulums)}</span>
        </div>
      )}
      <svg
        viewBox={`${bounds.xM} ${bounds.yM} ${bounds.widthM} ${bounds.heightM}`}
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label={`${pendulums.length} pendulums`}
      >
        <g className="grid">
          {gridXs.map((x) => (
            <line key={`x${x}`} x1={x} y1={0} x2={x} y2={bounds.yM + bounds.heightM} />
          ))}
          {gridYs.map((y) => (
            <line key={`y${y}`} x1={bounds.xM} y1={y} x2={bounds.xM + bounds.widthM} y2={y} />
          ))}
        </g>
        <line className={inCycle ? "beam beam--cycle" : "beam"} x1={bounds.xM} y1={0} x2={bounds.xM + bounds.widthM} y2={0} />
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
    </div>
  );
}
