/**
 * The rally rhythm the decoder expects, learned from this session's own
 * events. Nothing about tempo is hard-coded: slow and fast players both get
 * a model centred on how they actually play.
 */
import type { DecodedEvent, Role } from './decode-types';

export interface TimingModel {
  /** Paddle contact → bounce on the far half. */
  hitToBounce: number;
  /** Bounce → the receiver's paddle contact. */
  bounceToHit: number;
  /** Serve contact → bounce on the server's own half. */
  serveBounce: number;
  /** Server-side bounce → receiver-side bounce. */
  serveCross: number;
  /** Log-scale spread of rally intervals around their expected value. */
  spread: number;
}

// Before any labels exist, intervals between consecutive likely impacts are
// all we have; hits and bounces alternate so both legs start at that median.
// Serve legs start as rough fractions of it (the serve's first bounce comes
// quickly, the cross to the far half takes about one leg) and are replaced by
// measured values as soon as a few serves have been decoded.
const SERVE_BOUNCE_RATIO = 0.3;
const SERVE_CROSS_RATIO = 1.1;
// Wide at first because hit→bounce and bounce→hit legs are not yet told apart.
const BOOTSTRAP_SPREAD = 0.3;
// Medians from fewer samples than this jump around too much to trust.
const MIN_SAMPLES = 6;
// Clamp the learned spread: too tight and natural variation reads as missed
// events; too loose and a neighbor table's beat fits as well as yours.
const MIN_SPREAD = 0.1;
const MAX_SPREAD = 0.3;
const MAD_TO_SD = 1.4826;
// Shorter than this is one sound's echo; longer is a pause between rallies.
const MIN_INTERVAL = 0.12;
export const RALLY_GAP_SECONDS = 2.0;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

export function bootstrapTiming(times: number[]): TimingModel | null {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d >= MIN_INTERVAL && d <= RALLY_GAP_SECONDS) gaps.push(d);
  }
  if (gaps.length < MIN_SAMPLES) return null;
  const m = median(gaps);
  return {
    hitToBounce: m,
    bounceToHit: m,
    serveBounce: SERVE_BOUNCE_RATIO * m,
    serveCross: SERVE_CROSS_RATIO * m,
    spread: BOOTSTRAP_SPREAD,
  };
}

/** Re-estimates each leg from directly observed transitions in a decode. */
export function learnTiming(events: DecodedEvent[], prior: TimingModel): TimingModel {
  const legs: Record<string, number[]> = { hb: [], bh: [], sb: [], sc: [] };
  const key = (a: Role, b: Role): string | null => {
    if (a === 'hit' && b === 'bounce') return 'hb';
    if ((a === 'bounce' || a === 'serveCross') && b === 'hit') return 'bh';
    if (a === 'serve' && b === 'serveBounce') return 'sb';
    if (a === 'serveBounce' && b === 'serveCross') return 'sc';
    return null;
  };
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    if (a.inferred || b.inferred || b.role === 'serve') continue;
    const k = key(a.role, b.role);
    const d = b.t - a.t;
    if (k && d <= RALLY_GAP_SECONDS) legs[k].push(d);
  }
  const pick = (k: string, fallback: number) => (legs[k].length >= MIN_SAMPLES ? median(legs[k]) : fallback);
  const hitToBounce = pick('hb', prior.hitToBounce);
  const bounceToHit = pick('bh', prior.bounceToHit);
  const logDev = [
    ...legs.hb.map((d) => Math.log(d / hitToBounce)),
    ...legs.bh.map((d) => Math.log(d / bounceToHit)),
  ];
  let spread = prior.spread;
  if (logDev.length >= MIN_SAMPLES) {
    spread = MAD_TO_SD * median(logDev.map(Math.abs));
  }
  return {
    hitToBounce,
    bounceToHit,
    serveBounce: pick('sb', prior.serveBounce),
    serveCross: pick('sc', prior.serveCross),
    spread: Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, spread)),
  };
}
