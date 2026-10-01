/**
 * Describes the few hundred milliseconds around an onset with features that
 * separate ball impacts (very short, broadband, fast decay, no pitch) from
 * speech, music and claps.
 */
import { hannWindow, nextPowerOfTwo, realFft } from './fft';
import { applyBiquad, highpassBiquad, movingAbsEnvelope } from './filters';
import { harmonicity } from './harmonicity';
import { refineOnset } from './onset';

export interface OnsetFeatures {
  /** Peak sample level in the first 10 ms, dBFS. */
  peakDb: number;
  centroidHz: number;
  /** How far the envelope jumps above the 10 ms before the onset, dB (above 1 kHz). */
  contrastDb: number;
  /** Wiener entropy, 0 (pure tone) … 1 (white noise). */
  flatness: number;
  /** Share of energy above 2 kHz. */
  highBandRatio: number;
  /**
   * ms for the envelope's excess over the pre-onset background to fall 20 dB.
   * Null when the onset is too close to the background level to time.
   */
  decayMs: number | null;
  /** Normalized autocorrelation peak at voice/music pitch lags, 0 … 1. */
  harmonicity: number;
}

// High-pass before the envelope so talk and room rumble below 1 kHz do not
// blur the attack or the decay of the click.
const ENVELOPE_HIGHPASS_HZ = 1000;
// ~0.2 ms keeps the attack sharp for timing; 1 ms smooths the oscillation of
// the ringing modes so the decay measurement does not catch a zero crossing.
const ONSET_ENVELOPE_HALF_MS = 0.2;
const DECAY_ENVELOPE_HALF_MS = 1;
// "Before" is the 10 ms ahead of the onset: long enough to average out noise,
// short enough to be the sound the click interrupted.
const BACKGROUND_MS = 10;
// A click peaks within a few ms of its start; 10 ms leaves room for the ring.
const PEAK_SEARCH_MS = 10;
// The spectral snapshot covers the click and its ring, not the room after it.
const SPECTRUM_MS = 12;
const SPECTRUM_LEAD_MS = 1;
const MIN_SPECTRUM_HZ = 100;
const FLATNESS_OCTAVES = 2;
// Same lower edge as the onset detector's band: where clicks live.
const HIGH_BAND_HZ = 2000;
// Keeps the log finite in bins where subtraction removed everything.
const SPECTRAL_FLOOR = 1e-12;
// −20 dB: far enough down that the click is clearly over, not so far that
// room noise decides when it ends.
const DECAY_DROP = 0.1;
// After the drop the envelope must stay under 30% of the excess for 12 ms,
// longer than one pitch period of any adult voice (≥ 80 Hz).
const DECAY_RELAPSE = 0.3;
const DECAY_HOLD_MS = 12;
// 6 dB over the pre-onset level; below that the decay is not measurable.
const MIN_PEAK_OVER_BACKGROUND = 2;
// Digital silence before an onset would make the contrast infinite; 60 dB is
// about the usable range of a phone microphone anyway.
const ENVELOPE_FLOOR = 1e-7;
const MAX_CONTRAST_DB = 60;
// Ball clicks are gone in under 40 ms; anything still sounding at 100 ms is
// something else, so there is no need to measure further.
export const DECAY_MAX_MS = 100;

/** Audio needed before the coarse frame start and after the frame end. */
export const SEGMENT_PRE_SECONDS = (SPECTRUM_MS + SPECTRUM_LEAD_MS + 2) / 1000;
export const SEGMENT_POST_SECONDS = (DECAY_MAX_MS + PEAK_SEARCH_MS + 5) / 1000;

const ms = (v: number, fs: number) => Math.round((v * fs) / 1000);

export interface LocatedOnset {
  /** Index of the impact's first sample within the segment. */
  onset: number;
  features: OnsetFeatures;
}

/**
 * @param segment     raw audio covering [frameStart − PRE, frameEnd + POST)
 * @param frameFrom   index in `segment` of the onset frame's first sample
 * @param frameTo     index one past the frame's last sample
 */
export function locateAndDescribe(
  segment: Float32Array,
  frameFrom: number,
  frameTo: number,
  sampleRate: number,
): LocatedOnset {
  const hp = Float32Array.from(segment);
  applyBiquad(hp, highpassBiquad(ENVELOPE_HIGHPASS_HZ, sampleRate));
  const sharp = new Float32Array(hp.length);
  movingAbsEnvelope(hp, sharp, Math.max(1, ms(ONSET_ENVELOPE_HALF_MS, sampleRate)));
  const bgFrom = Math.max(0, frameFrom - ms(BACKGROUND_MS, sampleRate));
  const onset = refineOnset(sharp, frameFrom, frameTo, bgFrom);
  const smooth = new Float32Array(hp.length);
  movingAbsEnvelope(hp, smooth, Math.max(1, ms(DECAY_ENVELOPE_HALF_MS, sampleRate)));
  return { onset, features: describe(segment, sharp, smooth, onset, sampleRate) };
}

function describe(x: Float32Array, sharp: Float32Array, smooth: Float32Array, onset: number, fs: number): OnsetFeatures {
  const peakEnd = Math.min(x.length, onset + ms(PEAK_SEARCH_MS, fs));
  let peak = 1e-9;
  for (let i = onset; i < peakEnd; i++) peak = Math.max(peak, Math.abs(x[i]));
  return {
    peakDb: 20 * Math.log10(peak),
    ...spectralShape(x, onset, fs),
    contrastDb: contrast(sharp, onset, fs),
    decayMs: decayTime(smooth, onset, fs),
    harmonicity: harmonicity(x, onset, fs),
  };
}

function powerSnapshot(x: Float32Array, from: number, len: number, window: Float32Array, n: number): Float32Array {
  const frame = new Float32Array(n);
  for (let i = 0; i < len; i++) {
    const j = from + i;
    frame[i] = j >= 0 && j < x.length ? x[j] * window[i] : 0;
  }
  const re = new Float32Array(n / 2 + 1);
  const im = new Float32Array(n / 2 + 1);
  realFft(frame, re, im);
  for (let k = 0; k < re.length; k++) re[k] = re[k] * re[k] + im[k] * im[k];
  return re;
}

/**
 * Shape of what the onset added: the spectrum just before the onset is
 * subtracted first, so steady music or talk underneath a click does not make
 * the click look noisy or bright.
 */
function spectralShape(x: Float32Array, onset: number, fs: number) {
  const len = ms(SPECTRUM_MS, fs);
  const n = nextPowerOfTwo(len);
  const w = hannWindow(len);
  const from = onset - ms(SPECTRUM_LEAD_MS, fs);
  const after = powerSnapshot(x, from, len, w, n);
  const before = powerSnapshot(x, from - len, len, w, n);
  const hzPerBin = fs / n;
  const nyquistBin = n / 2;
  const minBin = Math.ceil(MIN_SPECTRUM_HZ / hzPerBin);
  const highBin = Math.ceil(HIGH_BAND_HZ / hzPerBin);
  const residual = after;
  let total = 1e-20;
  let weighted = 0;
  let high = 0;
  for (let k = minBin; k <= nyquistBin; k++) {
    const p = Math.max(0, after[k] - before[k]) + SPECTRAL_FLOOR;
    residual[k] = p;
    total += p;
    weighted += p * k * hzPerBin;
    if (k >= highBin) high += p;
  }
  const centroidHz = weighted / total;
  // Flatness inside the sound's own main band (an octave either side of its
  // centroid) asks "a few resonances, or noise?" without being fooled by the
  // empty bins of a band-limited sound such as a hi-hat.
  const lo = Math.max(minBin, Math.floor(centroidHz / FLATNESS_OCTAVES / hzPerBin));
  const hi = Math.min(nyquistBin, Math.max(lo + 1, Math.ceil((centroidHz * FLATNESS_OCTAVES) / hzPerBin)));
  let logSum = 0;
  let linSum = 0;
  for (let k = lo; k <= hi; k++) {
    logSum += Math.log(residual[k]);
    linSum += residual[k];
  }
  const bins = hi - lo + 1;
  return {
    centroidHz,
    flatness: Math.exp(logSum / bins) / (linSum / bins),
    highBandRatio: high / total,
  };
}

function backgroundLevel(env: Float32Array, onset: number, fs: number): number {
  const from = Math.max(0, onset - ms(BACKGROUND_MS, fs));
  const to = Math.max(from + 1, onset - ms(1, fs));
  let sum = 0;
  for (let i = from; i < to; i++) sum += env[i];
  return Math.max(sum / (to - from), ENVELOPE_FLOOR);
}

function peakIndex(env: Float32Array, onset: number, fs: number): number {
  const end = Math.min(env.length, onset + ms(PEAK_SEARCH_MS, fs));
  let at = onset;
  for (let i = onset; i < end; i++) if (env[i] > env[at]) at = i;
  return at;
}

/** Measured on the sharp envelope so a sub-millisecond click is not averaged away. */
function contrast(env: Float32Array, onset: number, fs: number): number {
  const peak = Math.max(env[peakIndex(env, onset, fs)], ENVELOPE_FLOOR);
  return Math.min(MAX_CONTRAST_DB, 20 * Math.log10(peak / backgroundLevel(env, onset, fs)));
}

function decayTime(env: Float32Array, onset: number, fs: number): number | null {
  const bg = backgroundLevel(env, onset, fs);
  const peakAt = peakIndex(env, onset, fs);
  const peak = env[peakAt];
  // A sound barely above the room cannot be timed: background wiggles would
  // read as a decay. Say "unknown" rather than a misleading number.
  if (peak < MIN_PEAK_OVER_BACKGROUND * bg) return null;
  // Measure the part of the sound that is new: the time for its excess over
  // the background to fall 20 dB. A click returns to the room level; a voice
  // or a note that starts and keeps going does not.
  const target = bg + DECAY_DROP * (peak - bg);
  // ...and it has to stay down. Voiced speech is a train of glottal pulses,
  // each a tiny click; without this, the gap between two pulses would read
  // as a 2 ms decay.
  const relapse = bg + DECAY_RELAPSE * (peak - bg);
  const hold = ms(DECAY_HOLD_MS, fs);
  const limit = Math.min(env.length - hold, peakAt + ms(DECAY_MAX_MS, fs));
  for (let i = peakAt; i < limit; i++) {
    if (env[i] >= target) continue;
    let stays = true;
    for (let k = 1; k <= hold && stays; k++) stays = env[i + k] < relapse;
    if (stays) return ((i - peakAt) * 1000) / fs;
  }
  return DECAY_MAX_MS;
}
