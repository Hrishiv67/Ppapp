/** Every sentence the app says about a session, in one place so the voice stays consistent. */
import type { SessionSummary } from "@/lib/engine";
import { minutes } from "./format";
import { steadyPlayMinutes } from "./steady";

/** Short tail that follows the steady minutes, e.g. "26 minutes · then choppier". */
export function steadyTail(s: SessionSummary): string {
  if (s.steadyWindow.status === "found") return "then choppier";
  if (s.steadyWindow.status === "held") return "the whole time";
  return "";
}

export function steadyLine(s: SessionSummary): string {
  const m = steadyPlayMinutes(s);
  if (s.steadyWindow.status === "found" && m !== null) return `Steady for ${Math.round(m)}, then choppier.`;
  if (s.steadyWindow.status === "held") return "Steady the whole time.";
  return "Play a little longer to see your steady time.";
}

export function spokenSummary(s: SessionSummary): string {
  const parts = [`You played ${minutes(s.activeSeconds)} minutes.`, `Your longest rally was ${s.longestRally} hits.`];
  const m = steadyPlayMinutes(s);
  if (s.steadyWindow.status === "found" && m !== null) parts.push(`Your rhythm stayed steady for ${Math.round(m)} minutes, then got choppier.`);
  if (s.steadyWindow.status === "held") parts.push("Your rhythm stayed steady the whole time.");
  return parts.join(" ");
}
