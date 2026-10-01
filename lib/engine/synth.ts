/**
 * Deterministic synthetic ping pong sessions with ground truth, used by the
 * unit tests, the benchmark and the e2e fixtures. Same seed → same samples.
 */
import { Rng, dbToGain } from './prng';
import { renderClap, renderImpact, type ImpactKind } from './synth-impact';
import { renderMusic } from './synth-music';
import { renderTalk } from './synth-voice';

export interface SynthOptions {
  seed: number;
  durationSec: number;
  sampleRate?: number;
  /** Paddle-to-paddle time (both players), seconds. Relaxed recreational play is ~1–1.5 s. */
  hitPeriodSec?: number;
  /** Coefficient of variation of hit-to-hit intervals. */
  timingCv?: number;
  restSec?: [number, number];
  hitsPerRally?: [number, number];
  impactLevelDb?: number;
  levelSpreadDb?: number;
  /** Share of paddle contacts that are soft touches, much quieter than normal. */
  softHitProbability?: number;
  /** Timing variability starts rising after `startMinutes`. */
  fatigue?: { startMinutes: number; cvPerMinute: number };
  reverb?: { rt60: number; levelDb: number };
  noiseFloorDb?: number;
  talk?: { levelDb: number };
  music?: { levelDb: number };
  claps?: { perMinute: number; levelDb: number; applauseProbability: number };
  neighbor?: { levelDb: number; periodRatio: number };
}

export interface TruthEvent {
  t: number;
  kind: ImpactKind;
}

export interface TruthRally {
  start: number;
  end: number;
  hits: number;
  impacts: number;
}

export interface SynthResult {
  samples: Float32Array;
  sampleRate: number;
  truth: { events: TruthEvent[]; rallies: TruthRally[] };
}

// Share of a hit-to-hit interval spent before the bounce: the ball crosses most
// of the table before landing, then rises to the next paddle.
const BOUNCE_FRACTION = 0.62;
const BOUNCE_JITTER = 0.03;
// Serve: the ball lands on the server's own half first, ~0.17 s after contact.
const SERVE_FIRST_BOUNCE_SEC = 0.17;
// A serve travels slower and further than a rally shot.
const SERVE_PERIOD_RATIO = 1.1;
// Per-rally tempo wander, as log-sd: players settle into a slightly
// different pace each rally.
const RALLY_TEMPO_SPREAD = 0.04;
// Beyond this the "rhythm" is no longer a back-and-forth at all.
const MAX_CV = 0.35;
// Rallies often end on a bounce the receiver misses; otherwise in the net.
const FINAL_BOUNCE_PROBABILITY = 0.6;
// A soft touch or a mishit off the edge: easy to miss, which tests repair.
const SOFT_HIT_DB = -16;
// A furnished room: short, quiet tail.
const DEFAULT_REVERB = { rt60: 0.25, levelDb: -24 };
// Air absorbs highs over the extra distance to another table.
const NEIGHBOR_LOWPASS_HZ = 4500;
// One person clapping after a good rally, at a natural clapping pace.
const APPLAUSE_CLAPS: [number, number] = [4, 8];
const APPLAUSE_SPACING_SEC: [number, number] = [0.22, 0.35];

interface Plan {
  events: TruthEvent[];
  rallies: TruthRally[];
}

function planRallies(rng: Rng, o: Required<Pick<SynthOptions, 'durationSec' | 'hitPeriodSec' | 'timingCv' | 'restSec' | 'hitsPerRally'>> & Pick<SynthOptions, 'fatigue'>): Plan {
  const events: TruthEvent[] = [];
  const rallies: TruthRally[] = [];
  const cvAt = (t: number) => {
    if (!o.fatigue) return o.timingCv;
    const over = Math.max(0, t / 60 - o.fatigue.startMinutes);
    return Math.min(MAX_CV, o.timingCv + over * o.fatigue.cvPerMinute);
  };
  const interval = (period: number, t: number) => period * Math.max(0.4, 1 + cvAt(t) * rng.normal());

  let t = rng.uniform(1, 3);
  for (;;) {
    const period = o.hitPeriodSec * Math.exp(RALLY_TEMPO_SPREAD * rng.normal());
    // Shorten the last rally to fit the session rather than stopping early.
    const room = Math.floor((o.durationSec - 1 - t) / (period * 1.5)) - 2;
    const hits = Math.min(rng.int(o.hitsPerRally[0], o.hitsPerRally[1]), room);
    if (hits < o.hitsPerRally[0]) break;
    const rally: TruthEvent[] = [{ t, kind: 'hit' }];
    rally.push({ t: t + SERVE_FIRST_BOUNCE_SEC * (1 + 0.1 * rng.normal()), kind: 'bounce' });
    let hitT = t;
    let next = t + interval(period * SERVE_PERIOD_RATIO, t);
    rally.push({ t: next - (1 - BOUNCE_FRACTION) * period * (1 + BOUNCE_JITTER * rng.normal()), kind: 'bounce' });
    for (let h = 1; h < hits; h++) {
      hitT = next;
      rally.push({ t: hitT, kind: 'hit' });
      next = hitT + interval(period, hitT);
      if (h < hits - 1 || rng.chance(FINAL_BOUNCE_PROBABILITY)) {
        const frac = BOUNCE_FRACTION * (1 + BOUNCE_JITTER * rng.normal());
        rally.push({ t: hitT + frac * (next - hitT), kind: 'bounce' });
      }
    }
    events.push(...rally);
    const end = rally[rally.length - 1].t;
    rallies.push({ start: t, end, hits, impacts: rally.length });
    t = end + rng.uniform(o.restSec[0], o.restSec[1]);
  }
  return { events, rallies };
}

function baseTiming(opts: SynthOptions) {
  return {
    durationSec: opts.durationSec,
    hitPeriodSec: opts.hitPeriodSec ?? 1.2,
    timingCv: opts.timingCv ?? 0.05,
    restSec: opts.restSec ?? ([3, 9] as [number, number]),
    hitsPerRally: opts.hitsPerRally ?? ([2, 16] as [number, number]),
  };
}

/** Ground truth only, without rendering audio: identical to synthesizeSession's truth. */
export function planSession(opts: SynthOptions): SynthResult['truth'] {
  return planRallies(new Rng(opts.seed), { ...baseTiming(opts), fatigue: opts.fatigue });
}

export function synthesizeSession(opts: SynthOptions): SynthResult {
  const sampleRate = opts.sampleRate ?? 48000;
  const rng = new Rng(opts.seed);
  const base = baseTiming(opts);
  const own = planRallies(rng, { ...base, fatigue: opts.fatigue });
  const samples = new Float32Array(Math.round(opts.durationSec * sampleRate));
  const level = opts.impactLevelDb ?? -14;
  const spread = opts.levelSpreadDb ?? 3;
  const softP = opts.softHitProbability ?? 0.03;
  const reverb = opts.reverb ?? DEFAULT_REVERB;

  renderNoise(samples, sampleRate, rng, opts.noiseFloorDb ?? -65);

  for (const e of own.events) {
    const soft = e.kind === 'hit' && rng.chance(softP);
    const db = level + spread * rng.normal() + (soft ? SOFT_HIT_DB : 0);
    renderImpact(samples, Math.round(e.t * sampleRate), sampleRate, e.kind, rng, { amplitude: dbToGain(db), reverb });
  }

  if (opts.neighbor) {
    const nRng = new Rng(opts.seed ^ 0x5bd1e995);
    const far = planRallies(nRng, { ...base, hitPeriodSec: base.hitPeriodSec * opts.neighbor.periodRatio, restSec: [2, 6] });
    const farReverb = { rt60: Math.max(reverb.rt60, 0.5), levelDb: reverb.levelDb + 8 };
    for (const e of far.events) {
      const db = level + opts.neighbor.levelDb + spread * nRng.normal();
      renderImpact(samples, Math.round(e.t * sampleRate), sampleRate, e.kind, nRng, {
        amplitude: dbToGain(db),
        lowpassHz: NEIGHBOR_LOWPASS_HZ,
        reverb: farReverb,
      });
    }
  }

  if (opts.talk) renderTalk(samples, sampleRate, new Rng(opts.seed ^ 0x1234567), opts.talk.levelDb, 0, opts.durationSec);
  if (opts.music) renderMusic(samples, sampleRate, new Rng(opts.seed ^ 0x7654321), opts.music.levelDb, 0, opts.durationSec);
  if (opts.claps) renderClaps(samples, sampleRate, new Rng(opts.seed ^ 0xc1a9), opts.claps, own.rallies, opts.durationSec);

  // A phone ADC clips rather than wraps; mimic it so loud scenes stay realistic.
  for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i]));
  return { samples, sampleRate, truth: own };
}

function renderNoise(out: Float32Array, sampleRate: number, rng: Rng, levelDb: number): void {
  // Room noise is mostly low-frequency (HVAC, traffic); a one-pole low-pass on
  // white noise with a little white mixed in is a cheap stand-in.
  const a = Math.exp((-2 * Math.PI * 1000) / sampleRate);
  const g = dbToGain(levelDb);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rng.normal();
    y = (1 - a) * w + a * y;
    out[i] += g * (2.5 * y + 0.3 * w);
  }
}

function renderClaps(
  out: Float32Array,
  sampleRate: number,
  rng: Rng,
  claps: NonNullable<SynthOptions['claps']>,
  rallies: TruthRally[],
  durationSec: number,
): void {
  const amp = () => dbToGain(claps.levelDb + 2 * rng.normal());
  for (const r of rallies) {
    if (!rng.chance(claps.applauseProbability)) continue;
    let t = r.end + rng.uniform(0.3, 0.8);
    const n = rng.int(APPLAUSE_CLAPS[0], APPLAUSE_CLAPS[1]);
    for (let i = 0; i < n; i++, t += rng.uniform(APPLAUSE_SPACING_SEC[0], APPLAUSE_SPACING_SEC[1])) {
      renderClap(out, Math.round(t * sampleRate), sampleRate, rng, amp());
    }
  }
  const single = Math.round((claps.perMinute * durationSec) / 60);
  for (let i = 0; i < single; i++) {
    renderClap(out, Math.round(rng.uniform(0, durationSec - 0.2) * sampleRate), sampleRate, rng, amp());
  }
}
