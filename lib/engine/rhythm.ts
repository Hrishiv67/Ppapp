/**
 * Rhythm steadiness from hit-to-hit intervals.
 *
 * score = 100 × (1 − robust CV), robust CV = 1.4826·MAD / median. MAD rather
 * than standard deviation so one mishit or a missed detection does not tank
 * the score.
 */
import type { DecodedEvent } from './decode-types';
import { median } from './timing';

export type RhythmLabel = 'steady' | 'mixed' | 'choppy';

export interface RhythmScore {
  score: number;
  label: RhythmLabel;
  intervals: number;
}

export interface HitInterval {
  /** Time of the later hit, seconds from session start. */
  t: number;
  dt: number;
}

// Starting points to revisit with real play, not clinical cut-offs:
// a CV of 15% or less still feels like an even back-and-forth; past 30% the
// beat is hard to hear at all.
export const STEADY_MIN_SCORE = 85;
export const MIXED_MIN_SCORE = 70;
// Fewer intervals than this give a score that swings ±5 points by chance.
export const MIN_INTERVALS_FOR_SCORE = 10;
const MAD_TO_SD = 1.4826;
// Serve legs skipped when hits and bounces are not told apart.
const SERVE_EVENTS = 3;

export function robustCv(dts: number[]): number {
  const m = median(dts);
  return (MAD_TO_SD * median(dts.map((d) => Math.abs(d - m)))) / m;
}

export function rhythmScore(dts: number[]): RhythmScore | null {
  if (dts.length < MIN_INTERVALS_FOR_SCORE) return null;
  const score = Math.max(0, Math.min(100, 100 * (1 - robustCv(dts))));
  const label: RhythmLabel = score >= STEADY_MIN_SCORE ? 'steady' : score >= MIXED_MIN_SCORE ? 'mixed' : 'choppy';
  return { score: Math.round(score * 10) / 10, label, intervals: dts.length };
}

/**
 * Paddle-to-paddle intervals inside one rally. The serve's interval is left
 * out (serves are slower and not part of the rally beat), and so is any
 * interval touching an inferred hit, whose time is a guess.
 * Without hit/bounce labels, every-other-impact spacing measures the same beat.
 */
export function hitIntervals(events: DecodedEvent[], labelsKnown: boolean): HitInterval[] {
  const out: HitInterval[] = [];
  if (labelsKnown) {
    let prev: DecodedEvent | null = null;
    for (const e of events) {
      if (e.kind !== 'hit') continue;
      if (prev && !prev.inferred && !e.inferred && prev.role !== 'serve') out.push({ t: e.t, dt: e.t - prev.t });
      prev = e;
    }
    return out;
  }
  for (let k = SERVE_EVENTS + 2; k < events.length; k++) {
    const a = events[k - 2];
    const b = events[k];
    if (!a.inferred && !b.inferred && !events[k - 1].inferred) out.push({ t: b.t, dt: b.t - a.t });
  }
  return out;
}
