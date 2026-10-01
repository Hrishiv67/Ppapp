/**
 * Radix-2 FFT and the small spectral helpers built on it.
 *
 * Plans (twiddles + bit-reversal table) are cached per size because the onset
 * detector runs ~190 transforms per second for the whole session; rebuilding
 * tables each call would dominate the cost.
 */

interface Plan {
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}

const plans = new Map<number, Plan>();

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function getPlan(n: number): Plan {
  const cached = plans.get(n);
  if (cached) return cached;
  if (!isPowerOfTwo(n)) throw new RangeError(`FFT size must be a power of two, got ${n}`);
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const plan = { cos, sin, rev };
  plans.set(n, plan);
  return plan;
}

/** Forward DFT in place: X[k] = sum x[n] e^{-2πikn/N}. No scaling. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (im.length !== n) throw new RangeError('re and im must have the same length');
  const { cos, sin, rev } = getPlan(n);

  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Twiddle-outer loop order: each twiddle is loaded once per stage instead
  // of once per butterfly group, which measured ~30% faster in V8.
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let k = 0; k < half; k++) {
      const wr = cos[k * step];
      const wi = sin[k * step];
      for (let a = k; a < n; a += size) {
        const b = a + half;
        const br = re[b];
        const bi = im[b];
        const xr = br * wr - bi * wi;
        const xi = br * wi + bi * wr;
        const ar = re[a];
        const ai = im[a];
        re[b] = ar - xr;
        im[b] = ai - xi;
        re[a] = ar + xr;
        im[a] = ai + xi;
      }
    }
  }
}

const halfScratch = new Map<number, { re: Float32Array; im: Float32Array }>();

/**
 * Spectrum of a real signal using one complex FFT of half the length (even
 * samples in the real part, odd in the imaginary part, then untangled). The
 * onset detector only ever transforms real audio, so this halves its cost.
 *
 * Writes X[0..N/2] into `outRe`/`outIm`, which need at least N/2 + 1 slots.
 */
export function realFft(x: Float32Array, outRe: Float32Array, outIm: Float32Array): void {
  const n = x.length;
  const m = n >> 1;
  let scratch = halfScratch.get(m);
  if (!scratch) {
    scratch = { re: new Float32Array(m), im: new Float32Array(m) };
    halfScratch.set(m, scratch);
  }
  const zr = scratch.re;
  const zi = scratch.im;
  for (let i = 0; i < m; i++) {
    zr[i] = x[2 * i];
    zi[i] = x[2 * i + 1];
  }
  fft(zr, zi);
  // The size-N plan already holds e^{-2πik/N} for k < N/2.
  const { cos, sin } = getPlan(n);
  for (let k = 0; k <= m; k++) {
    const a = k % m;
    const b = (m - k) % m;
    const er = 0.5 * (zr[a] + zr[b]);
    const ei = 0.5 * (zi[a] - zi[b]);
    const or = 0.5 * (zi[a] + zi[b]);
    const oi = -0.5 * (zr[a] - zr[b]);
    const wr = k < m ? cos[k] : -1;
    const wi = k < m ? sin[k] : 0;
    outRe[k] = er + wr * or - wi * oi;
    outIm[k] = ei + wr * oi + wi * or;
  }
}

/** Periodic Hann window: the variant that sums to a constant at 75% overlap. */
export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** |X[k]|² for k = 0..N/2. Writes into `out` when given so hot loops stay allocation-free. */
export function powerSpectrum(
  re: Float32Array,
  im: Float32Array,
  out: Float32Array = new Float32Array((re.length >> 1) + 1),
): Float32Array {
  const bins = (re.length >> 1) + 1;
  for (let k = 0; k < bins; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

export function binToHz(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize;
}

export function hzToBin(hz: number, fftSize: number, sampleRate: number): number {
  return Math.round((hz * fftSize) / sampleRate);
}
