/**
 * How pitched the sound is just after an onset: the normalized
 * autocorrelation peak at voice and music pitch lags. Speech and notes are
 * periodic; the tail of a ball click is not.
 */
import { applyBiquad, highpassBiquad } from './filters';

// Start the pitch analysis after the click so its ring does not count; what
// is left 10 ms later is voice or music if anything is.
const HARMONIC_START_MS = 10;
// 40 ms holds at least three periods of the lowest pitch we look for.
const HARMONIC_WINDOW_MS = 40;
// Pitch lags for 80–400 Hz: the range of voices and most melodic notes.
const HARMONIC_MIN_LAG_MS = 2.5;
const HARMONIC_MAX_LAG_MS = 12.5;
// Pitch periodicity survives at 8 kHz; decimating makes the lag search ~36× cheaper at 48 kHz.
const HARMONIC_RATE_HZ = 8000;
// Kick drums and room rumble below the pitch range carry most of the energy
// but no pitch; removing them lets the harmonics decide.
const HARMONIC_HIGHPASS_HZ = 200;

/** @returns 0 (no pitch) … 1 (perfectly periodic) for the audio after `onset`. */
export function harmonicity(x: Float32Array, onset: number, fs: number): number {
  const factor = Math.max(1, Math.floor(fs / HARMONIC_RATE_HZ));
  const rate = fs / factor;
  const start = onset + Math.round((HARMONIC_START_MS * fs) / 1000);
  const win = Math.round((HARMONIC_WINDOW_MS * rate) / 1000);
  const minLag = Math.round((HARMONIC_MIN_LAG_MS * rate) / 1000);
  const maxLag = Math.round((HARMONIC_MAX_LAG_MS * rate) / 1000);
  // Box-average decimation is a crude anti-alias filter, but pitch lives far
  // below the new Nyquist so the leakage does not matter here.
  const d = new Float32Array(win + maxLag);
  for (let i = 0; i < d.length; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) {
      const j = start + i * factor + k;
      if (j < x.length) s += x[j];
    }
    d[i] = s / factor;
  }
  applyBiquad(d, highpassBiquad(HARMONIC_HIGHPASS_HZ, rate));
  let r0 = 0;
  for (let i = 0; i < win; i++) r0 += d[i] * d[i];
  if (r0 <= 0) return 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < win; i++) r += d[i] * d[i + lag];
    best = Math.max(best, r / r0);
  }
  // A sound that is getting louder (a voice starting) can push r(L) past r(0).
  return Math.min(1, best);
}
