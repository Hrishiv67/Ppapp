/**
 * Modal synthesis of ball impacts and claps for synthetic test sessions.
 *
 * An impact is a few exponentially decaying sinusoids (the struck object's
 * modes) plus a sub-millisecond contact click. The numbers below are a model,
 * not measurements: they encode the assumption the classifier relies on —
 * table bounces are brighter and ring longer (hard wood and the hollow ball
 * shell), paddle hits are duller and die faster (rubber and sponge absorb the
 * ball's high modes and the blade adds a low thud).
 */
import { applyBiquad, bandpassBiquad } from './filters';
import { Rng } from './prng';

export type ImpactKind = 'hit' | 'bounce';

interface ModeSpec {
  count: number;
  freqHz: [number, number];
  tauMs: [number, number];
  weight: [number, number];
}

interface ImpactSpec {
  modes: ModeSpec[];
  clickMs: number;
  clickWeight: number;
  // One-pole low-pass on the click: rubber softens the contact transient.
  clickLowpassHz: number;
}

const BOUNCE: ImpactSpec = {
  modes: [
    { count: 4, freqHz: [3000, 7500], tauMs: [5, 9], weight: [0.5, 1] },
    { count: 1, freqHz: [800, 1400], tauMs: [6, 10], weight: [0.25, 0.4] },
  ],
  clickMs: 0.3,
  clickWeight: 0.5,
  clickLowpassHz: 20000,
};

// The ball's own shell modes ring on a paddle hit too, but rubber and sponge
// damp them within a couple of milliseconds; the blade adds a low thud.
const PADDLE: ImpactSpec = {
  modes: [
    { count: 3, freqHz: [2000, 5000], tauMs: [1.2, 2.2], weight: [0.5, 1] },
    { count: 1, freqHz: [400, 900], tauMs: [3, 5], weight: [0.5, 0.8] },
  ],
  clickMs: 0.8,
  clickWeight: 0.4,
  clickLowpassHz: 3000,
};

// Modes this close to Nyquist would alias in a real ADC; drop them like the
// device's anti-alias filter would.
const MAX_MODE_FRACTION_OF_RATE = 0.45;
// Contact time of a 40 mm ball is well under a millisecond.
const ATTACK_MS = 0.08;
// After 7 time constants a mode is 60 dB down: inaudible, safe to stop.
const DECAY_LENGTH_TAUS = 7;

// Early reflections arrive a few ms after the direct sound in a small room.
const REVERB_PREDELAY_MS = 3;
const REVERB_RISE_MS = 5;
// Room surfaces absorb highs, so the tail is darker than the direct click.
const REVERB_LOWPASS_HZ = 3500;
// RT60 is the time to fall 60 dB, a factor of 1000 in amplitude.
const RT60_DECAY = Math.log(1000);

// A hand clap is a handful of air bursts a few ms apart as the palms meet,
// band-limited by the cupped hands, then a short room tail.
const CLAP_BURSTS: [number, number] = [3, 4];
const CLAP_BURST_SPACING_MS: [number, number] = [2, 4];
const CLAP_BURST_TAU_MS = 1.5;
const CLAP_TAIL_TAU_MS = 12;
const CLAP_CENTER_HZ: [number, number] = [1000, 2200];
const CLAP_Q = 1.2;

export interface ImpactRender {
  amplitude: number;
  /** Air absorption over distance takes highs off a far table. */
  lowpassHz?: number;
  reverb?: { rt60: number; levelDb: number };
}

function onePoleLowpass(x: Float32Array, cutoffHz: number, sampleRate: number): void {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y;
    x[i] = y;
  }
}

function addNormalized(out: Float32Array, start: number, src: Float32Array, amplitude: number): void {
  let peak = 0;
  for (let i = 0; i < src.length; i++) peak = Math.max(peak, Math.abs(src[i]));
  if (peak === 0) return;
  const g = amplitude / peak;
  const end = Math.min(out.length, start + src.length);
  for (let i = Math.max(0, start); i < end; i++) out[i] += src[i - start] * g;
}

export function renderImpact(
  out: Float32Array,
  start: number,
  sampleRate: number,
  kind: ImpactKind,
  rng: Rng,
  opts: ImpactRender,
): void {
  const spec = kind === 'bounce' ? BOUNCE : PADDLE;
  const longestTau = Math.max(...spec.modes.map((m) => m.tauMs[1]));
  const len = Math.ceil((DECAY_LENGTH_TAUS * longestTau * sampleRate) / 1000);
  const buf = new Float32Array(len);
  const maxFreq = MAX_MODE_FRACTION_OF_RATE * sampleRate;
  const attack = (ATTACK_MS * sampleRate) / 1000;

  for (const m of spec.modes) {
    for (let c = 0; c < m.count; c++) {
      const f = rng.uniform(m.freqHz[0], m.freqHz[1]);
      const tau = (rng.uniform(m.tauMs[0], m.tauMs[1]) * sampleRate) / 1000;
      const w = rng.uniform(m.weight[0], m.weight[1]);
      const phase = rng.uniform(0, 2 * Math.PI);
      if (f >= maxFreq) continue;
      const dphi = (2 * Math.PI * f) / sampleRate;
      for (let i = 0; i < len; i++) {
        buf[i] += w * Math.exp(-i / tau) * Math.sin(phase + dphi * i) * (1 - Math.exp(-i / attack));
      }
    }
  }

  const clickLen = Math.max(2, Math.round((spec.clickMs * sampleRate) / 1000));
  const click = new Float32Array(clickLen);
  for (let i = 0; i < clickLen; i++) click[i] = rng.uniform(-1, 1) * spec.clickWeight;
  if (spec.clickLowpassHz < sampleRate / 2) onePoleLowpass(click, spec.clickLowpassHz, sampleRate);
  for (let i = 0; i < clickLen; i++) buf[i] += click[i];

  if (opts.lowpassHz) onePoleLowpass(buf, opts.lowpassHz, sampleRate);
  addNormalized(out, start, buf, opts.amplitude);
  if (opts.reverb) renderReverbTail(out, start, sampleRate, rng, opts.amplitude, opts.reverb);
}

/** Exponentially decaying noise: the textbook statistical model of a room tail. */
export function renderReverbTail(
  out: Float32Array,
  start: number,
  sampleRate: number,
  rng: Rng,
  amplitude: number,
  reverb: { rt60: number; levelDb: number },
): void {
  const len = Math.ceil(reverb.rt60 * sampleRate);
  const buf = new Float32Array(len);
  const rise = (REVERB_RISE_MS * sampleRate) / 1000;
  for (let i = 0; i < len; i++) {
    buf[i] = rng.normal() * Math.exp((-RT60_DECAY * i) / len) * (1 - Math.exp(-i / rise));
  }
  onePoleLowpass(buf, REVERB_LOWPASS_HZ, sampleRate);
  const g = amplitude * Math.pow(10, reverb.levelDb / 20);
  const offset = start + Math.round((REVERB_PREDELAY_MS * sampleRate) / 1000);
  addNormalized(out, offset, buf, g);
}

export function renderClap(out: Float32Array, start: number, sampleRate: number, rng: Rng, amplitude: number): void {
  const len = Math.ceil(0.12 * sampleRate);
  const buf = new Float32Array(len);
  const msToSamples = sampleRate / 1000;
  const bursts = rng.int(CLAP_BURSTS[0], CLAP_BURSTS[1]);
  let at = 0;
  for (let b = 0; b < bursts; b++) {
    const tau = CLAP_BURST_TAU_MS * msToSamples;
    const w = b === bursts - 1 ? 1 : rng.uniform(0.4, 0.8);
    for (let i = Math.round(at); i < len; i++) buf[i] += w * rng.normal() * Math.exp(-(i - at) / tau);
    at += rng.uniform(CLAP_BURST_SPACING_MS[0], CLAP_BURST_SPACING_MS[1]) * msToSamples;
  }
  const tailTau = CLAP_TAIL_TAU_MS * msToSamples;
  for (let i = Math.round(at); i < len; i++) buf[i] += 0.5 * rng.normal() * Math.exp(-(i - at) / tailTau);
  applyBiquad(buf, bandpassBiquad(rng.uniform(CLAP_CENTER_HZ[0], CLAP_CENTER_HZ[1]), sampleRate, CLAP_Q));
  addNormalized(out, start, buf, amplitude);
}
