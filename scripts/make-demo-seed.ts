/**
 * Builds lib/demo/seed.json: a week of sessions for Demo mode. Each one is
 * synthetic audio run through the real RallySession, so every number and
 * chart in the demo is genuine engine output, not hand-typed data.
 *
 *   npx tsx scripts/make-demo-seed.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { RallySession, synthesizeSession, type SessionSummary } from '../lib/engine';

// 16 kHz renders and analyzes ~3× faster than 48 kHz; the engine supports it.
const SAMPLE_RATE = 16000;
const CHUNK = 2048;

interface DemoDay {
  /** Days before the demo's "today". */
  daysAgo: number;
  startHour: number;
  minutes: number;
  seed: number;
  fatigueAfter?: number;
  longest: number;
}

// One week that tells a believable story: regular play, Friday is today and
// the player tires after about 20 minutes.
const WEEK: DemoDay[] = [
  { daysAgo: 4, startHour: 10, minutes: 34, seed: 101, longest: 22 },
  { daysAgo: 2, startHour: 15, minutes: 46, seed: 202, longest: 28 },
  { daysAgo: 1, startHour: 10, minutes: 27, seed: 303, longest: 25 },
  { daysAgo: 0, startHour: 18, minutes: 38, seed: 404, fatigueAfter: 20, longest: 33 },
];

export interface DemoSession {
  daysAgo: number;
  startHour: number;
  summary: SessionSummary;
}

function run(day: DemoDay): SessionSummary {
  const { samples } = synthesizeSession({
    seed: day.seed,
    durationSec: day.minutes * 60,
    sampleRate: SAMPLE_RATE,
    timingCv: 0.04,
    hitsPerRally: [3, day.longest],
    restSec: [4, 12],
    fatigue: day.fatigueAfter ? { startMinutes: day.fatigueAfter, cvPerMinute: 0.02 } : undefined,
    talk: { levelDb: -34 },
  });
  const session = new RallySession({ sampleRate: SAMPLE_RATE });
  for (let i = 0; i < samples.length; i += CHUNK) session.push(samples.subarray(i, i + CHUNK));
  if (day.fatigueAfter) session.mark('meds', 9 * 60);
  return session.finish();
}

const out: DemoSession[] = WEEK.map((day) => {
  const summary = run(day);
  console.log(
    `-${day.daysAgo}d  active ${(summary.activeSeconds / 60).toFixed(1)} min  ` +
      `rallies ${summary.rallyCount}  longest ${summary.longestRally}  ` +
      `rhythm ${summary.rhythm?.score ?? '–'}  steady ${summary.steadyWindow.status} ${summary.steadyWindow.minutes ?? ''}`,
  );
  // The demo charts read rallies and rhythm blocks; the per-impact event list
  // would only add ~half a megabyte to the bundle.
  return { daysAgo: day.daysAgo, startHour: day.startHour, summary: { ...summary, events: [] } };
});

mkdirSync('lib/demo', { recursive: true });
writeFileSync('lib/demo/seed.json', JSON.stringify(out));
console.log('wrote lib/demo/seed.json');
