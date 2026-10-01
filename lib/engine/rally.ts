/**
 * Splits decoded impacts into rallies and counts paddle hits in each.
 */
import type { DecodedEvent } from './decode-types';
import { RALLY_GAP_SECONDS } from './timing';

// Serve, own-side bounce, far-side bounce: anything shorter is not a rally.
export const MIN_IMPACTS_PER_RALLY = 3;

export interface Rally {
  /** Seconds from session start of the first and last impact. */
  start: number;
  end: number;
  impacts: number;
  /** Paddle contacts. */
  hits: number;
  /** True when hits are ceil(impacts / 2) because hits and bounces could not be told apart. */
  hitsEstimated: boolean;
  /** Impacts the decoder filled in because they were not heard. */
  inferred: number;
}

export interface RallyGroup {
  rally: Rally;
  events: DecodedEvent[];
}

/** Splits a time-ordered event list wherever the silence exceeds the rally gap. */
export function groupByGap(events: DecodedEvent[]): DecodedEvent[][] {
  const groups: DecodedEvent[][] = [];
  for (const e of events) {
    const current = groups[groups.length - 1];
    if (current && e.t - current[current.length - 1].t <= RALLY_GAP_SECONDS) current.push(e);
    else groups.push([e]);
  }
  return groups;
}

/** Groups by silence longer than the rally gap and drops groups too short to be a rally. */
export function segmentRallies(events: DecodedEvent[], labelsKnown: boolean): RallyGroup[] {
  return groupByGap(events)
    .filter((g) => g.length >= MIN_IMPACTS_PER_RALLY)
    .map((g) => ({ rally: toRally(g, labelsKnown), events: g }));
}

export function toRally(events: DecodedEvent[], labelsKnown: boolean): Rally {
  const hits = events.filter((e) => e.kind === 'hit').length;
  return {
    start: events[0].t,
    end: events[events.length - 1].t,
    impacts: events.length,
    hits: labelsKnown ? hits : Math.ceil(events.length / 2),
    hitsEstimated: !labelsKnown,
    inferred: events.filter((e) => e.inferred).length,
  };
}
