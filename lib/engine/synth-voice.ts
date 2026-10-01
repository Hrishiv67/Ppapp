/**
 * Source–filter speech stand-in: a glottal pulse train through three formant
 * resonators, with fricatives and plosive bursts. Plosives ("t", "k", "p")
 * are the realistic hard case for an impact detector: a sharp broadband burst
 * a few ms long, so they are included on purpose.
 */
import { applyBiquad, highpassBiquad } from './filters';
import { Rng } from './prng';

const UTTERANCE_SECONDS: [number, number] = [1, 5];
const PAUSE_SECONDS: [number, number] = [0.3, 3];
const SYLLABLE_SECONDS: [number, number] = [0.12, 0.28];
const SYLLABLE_GAP_SECONDS: [number, number] = [0, 0.04];
// Adult speaking pitch range covering low male to high female voices.
const F0_HZ: [number, number] = [95, 230];
// Typical vowel formant ranges (Peterson & Barney style F1/F2/F3 spans).
const FORMANTS: Array<{ hz: [number, number]; bandwidth: number }> = [
  { hz: [300, 800], bandwidth: 80 },
  { hz: [900, 2300], bandwidth: 100 },
  { hz: [2400, 3000], bandwidth: 150 },
];
const CONSONANT_PROBABILITY = 0.5;
const FRICATIVE_HIGHPASS_HZ = 3500;
const PLOSIVE_BURST_TAU_MS = 3;
// Voice onset time after a plosive burst, filled with aspiration noise.
const VOICE_ONSET_MS: [number, number] = [10, 40];
const VOICED_RISE_SECONDS = 0.03;
const VOICED_FALL_SECONDS = 0.06;

/** Rosenberg glottal pulse, differentiated for lip radiation. */
function glottalFlow(phase: number): number {
  if (phase < 0.4) return 0.5 * (1 - Math.cos((Math.PI * phase) / 0.4));
  if (phase < 0.6) return Math.cos((Math.PI * (phase - 0.4)) / 0.4);
  return 0;
}

function resonate(x: Float32Array, hz: number, bandwidth: number, sampleRate: number): void {
  const r = Math.exp((-Math.PI * bandwidth) / sampleRate);
  const a1 = -2 * r * Math.cos((2 * Math.PI * hz) / sampleRate);
  const a2 = r * r;
  const g = 1 - r;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = g * x[i] - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

function addScaled(out: Float32Array, start: number, src: Float32Array, gain: number): void {
  const end = Math.min(out.length, start + src.length);
  for (let i = Math.max(0, start); i < end; i++) out[i] += src[i - start] * gain;
}

function voiced(sampleRate: number, seconds: number, rng: Rng): Float32Array {
  const len = Math.round(seconds * sampleRate);
  const buf = new Float32Array(len);
  const f0a = rng.uniform(F0_HZ[0], F0_HZ[1]);
  const f0b = f0a * rng.uniform(0.85, 1.15);
  let phase = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const f0 = f0a + ((f0b - f0a) * i) / len;
    phase += f0 / sampleRate;
    if (phase >= 1) phase -= 1;
    const g = glottalFlow(phase);
    buf[i] = g - prev;
    prev = g;
  }
  for (const f of FORMANTS) {
    const hz = Math.min(rng.uniform(f.hz[0], f.hz[1]), 0.45 * sampleRate);
    resonate(buf, hz, f.bandwidth, sampleRate);
  }
  const rise = VOICED_RISE_SECONDS * sampleRate;
  const fall = VOICED_FALL_SECONDS * sampleRate;
  for (let i = 0; i < len; i++) buf[i] *= Math.min(1, i / rise, (len - i) / fall);
  const level = rms(buf);
  for (let i = 0; i < len; i++) buf[i] /= level;
  return buf;
}

function noiseBurst(sampleRate: number, seconds: number, tauMs: number | null, rng: Rng): Float32Array {
  const len = Math.max(1, Math.round(seconds * sampleRate));
  const buf = new Float32Array(len);
  const tau = tauMs === null ? Infinity : (tauMs * sampleRate) / 1000;
  const edge = 0.02 * sampleRate;
  for (let i = 0; i < len; i++) {
    const env = tauMs === null ? Math.min(1, i / edge, (len - i) / edge) : Math.exp(-i / tau);
    buf[i] = rng.normal() * env;
  }
  return buf;
}

/** Adds talk between `fromSec` and `toSec`; `levelDb` is the RMS of voiced sound. */
export function renderTalk(
  out: Float32Array,
  sampleRate: number,
  rng: Rng,
  levelDb: number,
  fromSec: number,
  toSec: number,
): void {
  const gain = Math.pow(10, levelDb / 20);
  const fricativeFilter = highpassBiquad(FRICATIVE_HIGHPASS_HZ, sampleRate);
  let t = fromSec + rng.uniform(0, PAUSE_SECONDS[1]);
  while (t < toSec) {
    const end = Math.min(toSec, t + rng.uniform(UTTERANCE_SECONDS[0], UTTERANCE_SECONDS[1]));
    while (t < end) {
      const syllableGain = gain * rng.uniform(0.6, 1.3);
      if (rng.chance(CONSONANT_PROBABILITY)) {
        if (rng.chance(0.5)) {
          const fric = noiseBurst(sampleRate, rng.uniform(0.06, 0.14), null, rng);
          applyBiquad(fric, fricativeFilter);
          addScaled(out, Math.round(t * sampleRate), fric, syllableGain * 0.5);
          t += fric.length / sampleRate;
        } else {
          const burst = noiseBurst(sampleRate, 0.015, PLOSIVE_BURST_TAU_MS, rng);
          addScaled(out, Math.round(t * sampleRate), burst, syllableGain * rng.uniform(0.5, 1.5));
          const vot = rng.uniform(VOICE_ONSET_MS[0], VOICE_ONSET_MS[1]) / 1000;
          const aspiration = noiseBurst(sampleRate, vot, null, rng);
          addScaled(out, Math.round((t + 0.005) * sampleRate), aspiration, syllableGain * 0.3);
          t += vot;
        }
      }
      const syl = voiced(sampleRate, rng.uniform(SYLLABLE_SECONDS[0], SYLLABLE_SECONDS[1]), rng);
      addScaled(out, Math.round(t * sampleRate), syl, syllableGain);
      t += syl.length / sampleRate + rng.uniform(SYLLABLE_GAP_SECONDS[0], SYLLABLE_GAP_SECONDS[1]);
    }
    t += rng.uniform(PAUSE_SECONDS[0], PAUSE_SECONDS[1]);
  }
}
