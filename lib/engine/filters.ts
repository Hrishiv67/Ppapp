/**
 * Small time-domain filters shared by onset refinement and feature extraction.
 * Coefficients follow the RBJ Audio EQ Cookbook (Robert Bristow-Johnson).
 */

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

const BUTTERWORTH_Q = Math.SQRT1_2;

export function highpassBiquad(cutoffHz: number, sampleRate: number, q = BUTTERWORTH_Q): Biquad {
  const w0 = (2 * Math.PI * Math.min(cutoffHz, 0.45 * sampleRate)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosw) / 2 / a0,
    b1: -(1 + cosw) / a0,
    b2: (1 + cosw) / 2 / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  };
}

export function bandpassBiquad(centerHz: number, sampleRate: number, q: number): Biquad {
  const w0 = (2 * Math.PI * Math.min(centerHz, 0.45 * sampleRate)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw = Math.cos(w0);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: (-2 * cosw) / a0, a2: (1 - alpha) / a0 };
}

/** Direct-form I, in place. State starts at zero, so callers include a short warm-up. */
export function applyBiquad(x: Float32Array, f: Biquad, from = 0, to = x.length): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = from; i < to; i++) {
    const x0 = x[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

/**
 * Amplitude envelope: rectify then a symmetric moving average. Symmetric rather
 * than a one-pole follower so the envelope does not lag the signal, which would
 * bias onset times late by the smoothing length.
 */
export function movingAbsEnvelope(x: Float32Array, out: Float32Array, halfWidth: number): void {
  const n = x.length;
  let acc = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const wantHi = Math.min(n, i + halfWidth + 1);
    const wantLo = Math.max(0, i - halfWidth);
    while (hi < wantHi) acc += Math.abs(x[hi++]);
    while (lo < wantLo) acc -= Math.abs(x[lo++]);
    out[i] = acc / (hi - lo);
  }
}
