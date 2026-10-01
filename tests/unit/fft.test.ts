import { describe, expect, it } from 'vitest';
import { fft, hannWindow, powerSpectrum, realFft } from '@/lib/engine/fft';
import { Rng } from '@/lib/engine/prng';

function naiveDft(re: Float32Array, im: Float32Array): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      outRe[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a);
      outIm[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a);
    }
  }
  return { re: outRe, im: outIm };
}

function randomSignal(n: number, rng: Rng): Float32Array {
  return Float32Array.from({ length: n }, () => rng.uniform(-1, 1));
}

describe('fft', () => {
  it.each([2, 8, 64, 256, 1024])('matches a naive DFT for n = %i', (n) => {
    const rng = new Rng(n);
    const re = randomSignal(n, rng);
    const im = randomSignal(n, rng);
    const want = naiveDft(re, im);
    fft(re, im);
    // Float32 storage limits precision to roughly 1e-6 relative per stage.
    const tol = 1e-4 * Math.sqrt(n) * Math.log2(n);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(want.re[k], 0);
      expect(Math.abs(re[k] - want.re[k])).toBeLessThan(tol);
      expect(Math.abs(im[k] - want.im[k])).toBeLessThan(tol);
    }
  });

  it('rejects sizes that are not a power of two', () => {
    expect(() => fft(new Float32Array(12), new Float32Array(12))).toThrow(RangeError);
  });

  it('realFft equals the complex FFT of a real signal', () => {
    const n = 512;
    const x = randomSignal(n, new Rng(3));
    const re = Float32Array.from(x);
    const im = new Float32Array(n);
    fft(re, im);
    const outRe = new Float32Array(n / 2 + 1);
    const outIm = new Float32Array(n / 2 + 1);
    realFft(x, outRe, outIm);
    for (let k = 0; k <= n / 2; k++) {
      expect(Math.abs(outRe[k] - re[k])).toBeLessThan(1e-3);
      expect(Math.abs(outIm[k] - im[k])).toBeLessThan(1e-3);
    }
  });

  it('puts a windowed sine in its own bin', () => {
    const n = 1024;
    const bin = 37;
    const w = hannWindow(n);
    const re = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * bin * i) / n) * w[i]);
    const im = new Float32Array(n);
    fft(re, im);
    const p = powerSpectrum(re, im);
    expect(p.length).toBe(n / 2 + 1);
    const peak = p.indexOf(Math.max(...p));
    expect(peak).toBe(bin);
  });

  it('hann window is zero at the start and one in the middle', () => {
    const w = hannWindow(8);
    expect(w[0]).toBe(0);
    expect(w[4]).toBeCloseTo(1, 6);
  });
});
