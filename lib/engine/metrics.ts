/**
 * Session-level numbers shown to the player. Every number on screen comes
 * from here.
 */
import type { RallyGroup } from './rally';
import { hitIntervals, rhythmScore, type HitInterval, type RhythmScore } from './rhythm';

export interface RhythmBlock {
  startMinute: number;
  endMinute: number;
  /** Null when the block holds too little play to score. */
  rhythm: RhythmScore | null;
}

export interface SteadyWindow {
  /** Minutes from session start until rhythm dropped; null unless status is 'found'. */
  minutes: number | null;
  status: 'found' | 'held' | 'insufficient';
  reason: string;
  baselineScore: number | null;
}

export interface SessionMetrics {
  activeSeconds: number;
  rallyCount: number;
  longestRally: number;
  totalHits: number;
  /** Paddle hits per minute of active play; null with under 30 s of play. */
  tempo: number | null;
  rhythm: RhythmScore | null;
  rhythmBlocks: RhythmBlock[];
  steadyWindow: SteadyWindow;
}

export const BLOCK_MINUTES = 5;
const MIN_ACTIVE_SECONDS_FOR_TEMPO = 30;

// Steady Window. The baseline is your own early play, so the comparison is
// you-versus-you, not against a norm. 120 intervals is ~4 minutes of rallying;
// fewer left the baseline itself swinging by ±4 points between sessions.
const BASELINE_INTERVALS = 120;
// Each later window scores 40 intervals (~1–2 minutes of rallying), which
// keeps window-to-window noise to a few points at typical variability.
const WINDOW_INTERVALS = 40;
const WINDOW_STEP = 10;
// A 10-point drop is well clear of that noise, and it must hold for two
// windows in a row, so it is a real change, not a bad minute. On synthetic
// steady sessions this never fires; see tests/unit/metrics.test.ts.
const DROP_POINTS = 10;

export function steadyWindow(intervals: HitInterval[]): SteadyWindow {
  if (intervals.length < BASELINE_INTERVALS + 2 * WINDOW_INTERVALS) {
    return { minutes: null, status: 'insufficient', reason: 'not enough play yet', baselineScore: null };
  }
  const dts = intervals.map((i) => i.dt);
  const baseline = rhythmScore(dts.slice(0, BASELINE_INTERVALS));
  if (!baseline) return { minutes: null, status: 'insufficient', reason: 'not enough play yet', baselineScore: null };
  const limit = baseline.score - DROP_POINTS;
  const scoreAt = (from: number) => rhythmScore(dts.slice(from, from + WINDOW_INTERVALS))?.score ?? Infinity;

  // A drop counts only if the next, non-overlapping window is also below the
  // line, so a single choppy stretch does not end the Steady Window.
  for (let from = BASELINE_INTERVALS; from + 2 * WINDOW_INTERVALS <= dts.length; from += WINDOW_STEP) {
    if (scoreAt(from) < limit && scoreAt(from + WINDOW_INTERVALS) < limit) {
      const middle = intervals[from + (WINDOW_INTERVALS >> 1)].t;
      return {
        minutes: Math.round((middle / 60) * 10) / 10,
        status: 'found',
        reason: 'rhythm dropped below your early-session level',
        baselineScore: baseline.score,
      };
    }
  }
  return { minutes: null, status: 'held', reason: 'rhythm held steady all session', baselineScore: baseline.score };
}

export function computeMetrics(groups: RallyGroup[], labelsKnown: boolean, durationSeconds: number): SessionMetrics {
  const rallies = groups.map((g) => g.rally);
  const activeSeconds = rallies.reduce((s, r) => s + (r.end - r.start), 0);
  const totalHits = rallies.reduce((s, r) => s + r.hits, 0);
  const intervals = groups.flatMap((g) => hitIntervals(g.events, labelsKnown));
  const blocks: RhythmBlock[] = [];
  const blockCount = Math.ceil(durationSeconds / (BLOCK_MINUTES * 60));
  for (let b = 0; b < blockCount; b++) {
    const lo = b * BLOCK_MINUTES * 60;
    const hi = lo + BLOCK_MINUTES * 60;
    const dts = intervals.filter((i) => i.t >= lo && i.t < hi).map((i) => i.dt);
    blocks.push({ startMinute: b * BLOCK_MINUTES, endMinute: (b + 1) * BLOCK_MINUTES, rhythm: rhythmScore(dts) });
  }
  return {
    activeSeconds,
    rallyCount: rallies.length,
    longestRally: rallies.reduce((m, r) => Math.max(m, r.hits), 0),
    totalHits,
    tempo: activeSeconds >= MIN_ACTIVE_SECONDS_FOR_TEMPO ? totalHits / (activeSeconds / 60) : null,
    rhythm: rhythmScore(intervals.map((i) => i.dt)),
    rhythmBlocks: blocks,
    steadyWindow: steadyWindow(intervals),
  };
}
