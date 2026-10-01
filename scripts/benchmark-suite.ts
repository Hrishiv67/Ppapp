/**
 * The fixed benchmark: which synthetic sessions verify.ts runs and how each
 * is scored. Changing anything here changes the expected numbers, so
 * regenerate lib/engine/benchmark.expected.json in the same change.
 */
import { scoreEvents, scoreRallies, truthMetrics } from '../lib/engine/evaluate';
import { RallySession } from '../lib/engine/session';
import { synthesizeSession, type SynthOptions } from '../lib/engine/synth';

export interface Scenario {
  name: string;
  sampleRate: number;
  durationSec: number;
  seeds: number[];
  options: Omit<SynthOptions, 'seed' | 'durationSec' | 'sampleRate'>;
  /** Score the Steady Window against the same metric on ground truth. */
  steadyWindow?: boolean;
}

const SEEDS = [11, 12, 13];
// Three minutes holds ~10 rallies: enough to count, quick enough to run often.
const SHORT = 180;

export const SCENARIOS: Scenario[] = [
  { name: 'quiet', sampleRate: 48000, durationSec: SHORT, seeds: SEEDS, options: {} },
  { name: 'quiet-16k', sampleRate: 16000, durationSec: SHORT, seeds: SEEDS, options: {} },
  { name: 'talk', sampleRate: 48000, durationSec: SHORT, seeds: SEEDS, options: { talk: { levelDb: -26 } } },
  { name: 'music', sampleRate: 44100, durationSec: SHORT, seeds: SEEDS, options: { music: { levelDb: -20 } } },
  {
    name: 'claps',
    sampleRate: 48000,
    durationSec: SHORT,
    seeds: SEEDS,
    options: { claps: { perMinute: 6, levelDb: -16, applauseProbability: 0.3 } },
  },
  {
    name: 'neighbor',
    sampleRate: 48000,
    durationSec: SHORT,
    seeds: SEEDS,
    options: { neighbor: { levelDb: -16, periodRatio: 0.78 } },
  },
  { name: 'reverb', sampleRate: 44100, durationSec: SHORT, seeds: SEEDS, options: { reverb: { rt60: 0.9, levelDb: -10 } } },
  {
    name: 'mixed',
    sampleRate: 48000,
    durationSec: SHORT,
    seeds: SEEDS,
    options: {
      talk: { levelDb: -30 },
      music: { levelDb: -30 },
      claps: { perMinute: 3, levelDb: -18, applauseProbability: 0.2 },
      reverb: { rt60: 0.5, levelDb: -16 },
      neighbor: { levelDb: -18, periodRatio: 1.25 },
    },
  },
  {
    // Variability starts rising at minute 10, 0.02 CV per minute: the true
    // Steady Window ends around minute 15–16.
    name: 'fatigue',
    sampleRate: 44100,
    durationSec: 22 * 60,
    seeds: [21, 22],
    options: { fatigue: { startMinutes: 10, cvPerMinute: 0.02 } },
    steadyWindow: true,
  },
];

export interface RunResult {
  precision: number;
  recall: number;
  f1: number;
  rallyCountError: number;
  hitsPerRallyError: number;
  activeMinutesError: number;
  /** |engine − truth| in minutes; null if either side found no drop. */
  steadyWindowError: number | null;
  audioSeconds: number;
  processSeconds: number;
}

// Push size the AudioWorklet uses, so the benchmark runs the streaming path.
const CHUNK = 2048;

export function runOnce(scenario: Scenario, seed: number): RunResult {
  const synth = synthesizeSession({
    seed,
    durationSec: scenario.durationSec,
    sampleRate: scenario.sampleRate,
    ...scenario.options,
  });
  const started = performance.now();
  const session = new RallySession({ sampleRate: synth.sampleRate });
  for (let i = 0; i < synth.samples.length; i += CHUNK) session.push(synth.samples.subarray(i, i + CHUNK));
  const summary = session.finish();
  const processSeconds = (performance.now() - started) / 1000;

  const events = scoreEvents(
    summary.events.map((e) => e.t),
    synth.truth.events.map((e) => e.t),
  );
  const rallies = scoreRallies(summary, synth.truth.rallies);
  let steadyWindowError: number | null = null;
  if (scenario.steadyWindow) {
    const truth = truthMetrics(synth.truth.events, scenario.durationSec).steadyWindow.minutes;
    const found = summary.steadyWindow.minutes;
    steadyWindowError = truth !== null && found !== null ? Math.abs(found - truth) : null;
  }
  return {
    precision: events.precision,
    recall: events.recall,
    f1: events.f1,
    rallyCountError: Math.abs(rallies.countError),
    hitsPerRallyError: rallies.hitsMeanAbsError,
    activeMinutesError: Math.abs(rallies.activeMinutesError),
    steadyWindowError,
    audioSeconds: scenario.durationSec,
    processSeconds,
  };
}
