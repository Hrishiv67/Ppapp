"use client";
import { useMemo, useState } from "react";
import type { Rally, SteadyWindow } from "@/lib/engine";

/**
 * The whole session at a glance: one dot per rally, placed in time and sized
 * by its hits. A dot sits on the line when its tempo matched the session's
 * usual pace and drifts off it when the rally ran faster or slower, so a
 * choppy stretch is visible without reading anything. The shaded band is the
 * Steady Window.
 */
const W = 342;
const H = 72;
const MIN_R = 2.5;
const MAX_R = 7;
// Tempo off by this fraction reaches the edge of the band.
const DRIFT_FULL = 0.25;

interface Props {
  rallies: Rally[];
  durationSeconds: number;
  steadyWindow: SteadyWindow;
  markers: { t: number; label: string }[];
}

export function SessionMap({ rallies, durationSeconds, steadyWindow, markers }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const dots = useMemo(() => {
    const pace = (r: Rally) => (r.end - r.start) / Math.max(1, r.hits - 1);
    const paces = rallies.filter((r) => r.hits >= 3).map(pace).sort((a, b) => a - b);
    const median = paces[Math.floor(paces.length / 2)] ?? 1;
    const maxHits = Math.max(...rallies.map((r) => r.hits), 1);
    return rallies.map((r) => {
      const drift = r.hits >= 3 ? (pace(r) - median) / median : 0;
      return {
        x: 8 + (r.start / durationSeconds) * (W - 16),
        y: H / 2 + Math.max(-1, Math.min(1, drift / DRIFT_FULL)) * (H / 2 - MAX_R),
        r: MIN_R + Math.sqrt(r.hits / maxHits) * (MAX_R - MIN_R),
        rally: r,
      };
    });
  }, [rallies, durationSeconds]);

  const steadyEnd =
    steadyWindow.status === "found" && steadyWindow.minutes !== null
      ? 8 + ((steadyWindow.minutes * 60) / durationSeconds) * (W - 16)
      : steadyWindow.status === "held"
        ? W
        : 0;
  const pick = picked !== null ? dots[picked] : null;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full overflow-visible" role="img" aria-label={`${rallies.length} rallies across the session`}>
        {steadyEnd > 0 && <rect x={0} y={0} width={steadyEnd} height={H} fill="var(--steady-tint)" className="rb-grow-x" />}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--ink)" strokeOpacity={0.18} />
        {markers.map((m) => {
          const x = 8 + (m.t / durationSeconds) * (W - 16);
          return (
            <g key={m.t}>
              <line x1={x} x2={x} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} />
              <text x={x + 6} y={H + 18} fontSize={13} fontWeight={600} fill="var(--ink-muted)">
                {m.label === "meds" ? "Medicine" : m.label}
              </text>
            </g>
          );
        })}
        {steadyEnd > 0 && (
          <text x={2} y={H + 18} fontSize={13} fontWeight={700} fill="var(--steady)">
            Steady
          </text>
        )}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="var(--ball)"
            opacity={pick && pick !== d ? 0.35 : 0.9}
            className="rb-dot-in cursor-pointer"
            style={{ transformOrigin: `${d.x}px ${d.y}px`, animationDelay: `${Math.min(i * 6, 500)}ms` }}
            onClick={() => setPicked(picked === i ? null : i)}
          >
            <title>{`${d.rally.hits} hits`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 h-6 text-[15px] font-medium text-ink-muted">
        {pick ? `Rally at ${Math.floor(pick.rally.start / 60)}:${String(Math.floor(pick.rally.start % 60)).padStart(2, "0")} · ${pick.rally.hits} hits` : ""}
      </figcaption>
    </figure>
  );
}
