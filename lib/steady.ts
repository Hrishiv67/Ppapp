import type { SessionSummary } from "@/lib/engine";

/**
 * The engine reports the Steady Window on the session clock (rests
 * included). Players think in minutes of play, the same unit as "active
 * minutes", so convert: sum the rally time before the point rhythm dropped.
 */
export function steadyPlayMinutes(s: SessionSummary): number | null {
  const w = s.steadyWindow;
  if (w.status === "held") return s.activeSeconds / 60;
  if (w.status !== "found" || w.minutes === null) return null;
  const cut = w.minutes * 60;
  const seconds = s.rallies.reduce((sum, r) => sum + Math.max(0, Math.min(r.end, cut) - r.start), 0);
  return seconds / 60;
}
