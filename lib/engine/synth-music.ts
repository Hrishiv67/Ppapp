/**
 * Background music stand-in: plucked notes (Karplus–Strong), a sustained
 * chord pad and a hi-hat/kick pattern. Plucks and hi-hats both have sharp
 * broadband onsets, which is what makes music a fair test for the gate.
 */
import { applyBiquad, highpassBiquad } from './filters';
import { Rng } from './prng';

const BPM: [number, number] = [90, 120];
// A minor pentatonic around A2–A4 keeps notes in a typical melody range.
const SCALE_HZ = [110, 130.8, 146.8, 164.8, 196, 220, 261.6, 293.7, 329.6, 392, 440];
const PLUCK_SECONDS = 1;
// Loss per period in Karplus–Strong; closer to 1 rings longer.
const PLUCK_DECAY = 0.996;
const HIHAT_HIGHPASS_HZ = 7000;
const HIHAT_TAU_MS = 20;
const KICK_SECONDS = 0.25;
const PAD_LOWPASS_HZ = 1500;
const BEATS_PER_CHORD = 8;

function karplusStrong(sampleRate: number, hz: number, rng: Rng): Float32Array {
  const len = Math.round(PLUCK_SECONDS * sampleRate);
  const period = Math.max(2, Math.round(sampleRate / hz));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = rng.uniform(-1, 1);
  const out = new Float32Array(len);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period;
    out[i] = line[idx];
    line[idx] = PLUCK_DECAY * 0.5 * (line[idx] + line[next]);
    idx = next;
  }
  return out;
}

function add(out: Float32Array, start: number, src: Float32Array, gain: number): void {
  const end = Math.min(out.length, start + src.length);
  for (let i = Math.max(0, start); i < end; i++) out[i] += src[i - start] * gain;
}

/** Adds music between `fromSec` and `toSec`; `levelDb` sets the pluck peak level. */
export function renderMusic(
  out: Float32Array,
  sampleRate: number,
  rng: Rng,
  levelDb: number,
  fromSec: number,
  toSec: number,
): void {
  const gain = Math.pow(10, levelDb / 20);
  const beat = 60 / rng.uniform(BPM[0], BPM[1]);
  const hihatFilter = highpassBiquad(HIHAT_HIGHPASS_HZ, sampleRate);
  const hihatTau = (HIHAT_TAU_MS * sampleRate) / 1000;
  const hihatLen = Math.round(0.15 * sampleRate);
  const kickLen = Math.round(KICK_SECONDS * sampleRate);

  let chord: number[] = [];
  let beatIndex = 0;
  for (let t = fromSec; t < toSec; t += beat, beatIndex++) {
    const at = Math.round(t * sampleRate);
    if (beatIndex % BEATS_PER_CHORD === 0) {
      const root = rng.int(0, 5);
      chord = [SCALE_HZ[root], SCALE_HZ[root + 2], SCALE_HZ[root + 4]];
      renderPad(out, at, Math.round(beat * BEATS_PER_CHORD * sampleRate), chord, sampleRate, gain * 0.25);
    }
    if (rng.chance(0.8)) add(out, at, karplusStrong(sampleRate, rng.pick(SCALE_HZ), rng), gain);
    if (beatIndex % 2 === 0) {
      const kick = new Float32Array(kickLen);
      let phase = 0;
      for (let i = 0; i < kickLen; i++) {
        const hz = 50 + 70 * Math.exp(-i / (0.03 * sampleRate));
        phase += (2 * Math.PI * hz) / sampleRate;
        kick[i] = Math.sin(phase) * Math.exp(-i / (0.08 * sampleRate));
      }
      add(out, at, kick, gain * 0.8);
    }
    const hat = new Float32Array(hihatLen);
    for (let i = 0; i < hihatLen; i++) hat[i] = rng.normal() * Math.exp(-i / hihatTau);
    applyBiquad(hat, hihatFilter);
    add(out, Math.round((t + beat / 2) * sampleRate), hat, gain * 0.35);
  }
}

function renderPad(
  out: Float32Array,
  start: number,
  len: number,
  chord: number[],
  sampleRate: number,
  gain: number,
): void {
  const a = Math.exp((-2 * Math.PI * PAD_LOWPASS_HZ) / sampleRate);
  const phases = chord.map(() => 0);
  let y = 0;
  const end = Math.min(out.length, start + len);
  const edge = 0.05 * sampleRate;
  for (let i = start; i < end; i++) {
    let s = 0;
    for (let c = 0; c < chord.length; c++) {
      phases[c] += chord[c] / sampleRate;
      if (phases[c] >= 1) phases[c] -= 1;
      s += 2 * phases[c] - 1;
    }
    y = (1 - a) * s + a * y;
    const k = i - start;
    out[i] += gain * y * Math.min(1, k / edge, (len - k) / edge);
  }
}
