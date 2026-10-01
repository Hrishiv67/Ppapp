/**
 * Scoring helpers shared by the benchmark and the tests: compare what the
 * engine found with synthetic ground truth.
 */
import type { DecodedEvent, Role } from './decode-types';
import { computeMetrics, type SessionMetrics } from './metrics';
import { segmentRallies } from './rally';
import type { SessionSummary } from './summary';
import type { TruthEvent, TruthRally } from './synth';
import { RALLY_GAP_SECONDS } from './timing';

/** Detection counts as correct within ±50 ms of a true impact. */
export const MATCH_TOLERANCE_SECONDS = 0.05;

export interface EventScore {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

/** Greedy one-to-one matching in time order; both lists sorted by time. */
export function scoreEvents(detected: number[], truth: number[], tolerance = MATCH_TOLERANCE_SECONDS): EventScore {
  let tp = 0;
  let j = 0;
  for (const t of truth) {
    while (j < detected.length && detected[j] < t - tolerance) j++;
    if (j < detected.length && Math.abs(detected[j] - t) <= tolerance) {
      tp++;
      j++;
    }
  }
  const fp = detected.length - tp;
  const fn = truth.length - tp;
  const precision = detected.length ? tp / detected.length : 1;
  const recall = truth.length ? tp / truth.length : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, f1 };
}

/** Ground truth expressed as decoded events, so metrics run through the same code. */
export function truthAsDecoded(events: TruthEvent[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  let sinceGap = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (i > 0 && e.t - events[i - 1].t > RALLY_GAP_SECONDS) sinceGap = 0;
    const servePhase: Role[] = ['serve', 'serveBounce', 'serveCross'];
    const role: Role = sinceGap < 3 ? servePhase[sinceGap] : e.kind;
    out.push({ t: e.t, kind: e.kind, role, inferred: false, source: i });
    sinceGap++;
  }
  return out;
}

export function truthMetrics(events: TruthEvent[], durationSeconds: number): SessionMetrics {
  return computeMetrics(segmentRallies(truthAsDecoded(events), true), true, durationSeconds);
}

export interface RallyScore {
  countError: number;
  /** Mean |hits − true hits| over rallies that overlap a true rally. */
  hitsMeanAbsError: number;
  activeMinutesError: number;
}

export function scoreRallies(summary: SessionSummary, truth: TruthRally[]): RallyScore {
  const errors: number[] = [];
  for (const r of summary.rallies) {
    const match = truth.find((t) => t.start <= r.end && r.start <= t.end);
    if (match) errors.push(Math.abs(r.hits - match.hits));
  }
  const trueActive = truth.reduce((s, r) => s + (r.end - r.start), 0);
  return {
    countError: summary.rallyCount - truth.length,
    hitsMeanAbsError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0,
    activeMinutesError: (summary.activeSeconds - trueActive) / 60,
  };
}
