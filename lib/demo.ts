/**
 * Demo week: four sessions of synthetic play run through the real engine by
 * scripts/make-demo-seed.ts. Dates are placed relative to today so the week
 * view always has something to show.
 */
import type { SessionSummary } from "@/lib/engine";
import type { StoredSession } from "@/lib/store/sessions";
import seed from "./demo/seed.json";

interface DemoSeed {
  daysAgo: number;
  startHour: number;
  summary: SessionSummary;
}

export function demoSessions(now = new Date()): StoredSession[] {
  return (seed as DemoSeed[])
    .map((d) => {
      const start = new Date(now);
      start.setDate(start.getDate() - d.daysAgo);
      start.setHours(d.startHour, 10, 0, 0);
      return { id: `demo-${d.daysAgo}`, startedAt: start.getTime(), summary: d.summary, demo: true };
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Where the live demo leaves its result for the summary screen. Never written to IndexedDB. */
export const DEMO_RESULT_KEY = "rallybeat-demo-result";
