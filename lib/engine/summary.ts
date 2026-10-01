/**
 * The serializable result of a session: what the summary screen shows and
 * what gets stored. Plain JSON, times in seconds from session start rounded
 * to the millisecond.
 */
import type { Analysis } from './analyze';
import { computeMetrics, type RhythmBlock, type SteadyWindow } from './metrics';
import type { Rally } from './rally';
import type { RhythmScore } from './rhythm';

export interface Marker {
  /** Seconds from session start. */
  t: number;
  /** Free text from the UI, e.g. "meds". Passed through untouched. */
  label: string;
}

export interface SummaryEvent {
  t: number;
  kind: 'hit' | 'bounce';
  /** Filled in by the decoder, not heard. */
  inferred: boolean;
}

export interface SessionSummary {
  version: 1;
  sampleRate: number;
  durationSeconds: number;
  /** Sum of rally durations (first to last impact). */
  activeSeconds: number;
  rallyCount: number;
  /** Most paddle hits in one rally. */
  longestRally: number;
  totalHits: number;
  /** True when hits could not be told from bounces and were estimated. */
  hitsEstimated: boolean;
  /** Paddle hits per minute of active play. */
  tempo: number | null;
  rhythm: RhythmScore | null;
  rhythmBlocks: RhythmBlock[];
  steadyWindow: SteadyWindow;
  rallies: Rally[];
  events: SummaryEvent[];
  markers: Marker[];
}

const ms = (t: number) => Math.round(t * 1000) / 1000;

export function buildSummary(
  analysis: Analysis,
  durationSeconds: number,
  sampleRate: number,
  markers: Marker[],
): SessionSummary {
  const m = computeMetrics(analysis.groups, analysis.labelsKnown, durationSeconds);
  return {
    version: 1,
    sampleRate,
    durationSeconds: ms(durationSeconds),
    activeSeconds: ms(m.activeSeconds),
    rallyCount: m.rallyCount,
    longestRally: m.longestRally,
    totalHits: m.totalHits,
    hitsEstimated: !analysis.labelsKnown,
    tempo: m.tempo === null ? null : Math.round(m.tempo * 10) / 10,
    rhythm: m.rhythm,
    rhythmBlocks: m.rhythmBlocks,
    steadyWindow: m.steadyWindow,
    rallies: analysis.groups.map(({ rally }) => ({ ...rally, start: ms(rally.start), end: ms(rally.end) })),
    events: analysis.groups.flatMap((g) => g.events.map((e) => ({ t: ms(e.t), kind: e.kind, inferred: e.inferred }))),
    markers: markers.map((mk) => ({ t: ms(mk.t), label: mk.label })),
  };
}
