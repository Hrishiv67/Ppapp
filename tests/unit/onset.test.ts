import { describe, expect, it } from 'vitest';
import { OnsetExtractor, type DescribedOnset } from '@/lib/engine/extractor';
import { onsetConfigFor } from '@/lib/engine/onset';
import { Rng } from '@/lib/engine/prng';
import { renderImpact } from '@/lib/engine/synth-impact';

function clicksInNoise(sampleRate: number, times: number[], seed: number): Float32Array {
  const rng = new Rng(seed);
  const x = new Float32Array(Math.round(sampleRate * (times[times.length - 1] + 1)));
  for (let i = 0; i < x.length; i++) x[i] = 0.001 * rng.normal();
  times.forEach((t, i) => {
    renderImpact(x, Math.round(t * sampleRate), sampleRate, i % 2 ? 'bounce' : 'hit', rng, { amplitude: 0.15 });
  });
  return x;
}

function detect(x: Float32Array, sampleRate: number): DescribedOnset[] {
  const ex = new OnsetExtractor(sampleRate);
  const out: DescribedOnset[] = [];
  ex.push(x, (o) => out.push(o));
  ex.flush((o) => out.push(o));
  return out;
}

describe('onset detection', () => {
  it('keeps the flux band inside Nyquist at low sample rates', () => {
    const c = onsetConfigFor(16000);
    expect(c.frameSize).toBe(512);
    expect((c.bandHighBin * 16000) / c.frameSize).toBeLessThan(8000);
    expect(onsetConfigFor(48000)).toMatchObject({ frameSize: 1024, hop: 256 });
  });

  it.each([48000, 44100, 16000])('times impacts to within 3 ms at %i Hz', (sampleRate) => {
    // Irregular spacing, including a 0.17 s serve bounce, at fractional sample positions.
    const times: number[] = [];
    let t = 0.8;
    const rng = new Rng(sampleRate);
    for (let i = 0; i < 40; i++) {
      times.push(t + rng.uniform(0, 1) / sampleRate);
      t += i % 5 === 0 ? 0.17 : rng.uniform(0.35, 0.8);
    }
    const found = detect(clicksInNoise(sampleRate, times, 1), sampleRate);
    expect(found.length).toBe(times.length);
    const errors = found.map((o, i) => Math.abs(o.t - times[i]) * 1000);
    expect(Math.max(...errors)).toBeLessThan(3);
    errors.sort((a, b) => a - b);
    expect(errors[errors.length >> 1]).toBeLessThan(1);
  });

  it('does not fire on steady noise', () => {
    const rng = new Rng(2);
    const x = Float32Array.from({ length: 48000 * 5 }, () => 0.01 * rng.normal());
    expect(detect(x, 48000).length).toBeLessThanOrEqual(1);
  });

  it('adapts to a loud room without calibration', () => {
    const times = [1, 1.6, 2.3, 2.9, 3.4];
    const quiet = detect(clicksInNoise(48000, times, 4), 48000);
    const loud = clicksInNoise(48000, times, 4);
    const rng = new Rng(8);
    // 20 dB more background noise than the quiet case.
    for (let i = 0; i < loud.length; i++) loud[i] += 0.01 * rng.normal();
    expect(quiet.length).toBe(times.length);
    expect(detect(loud, 48000).length).toBe(times.length);
  });
});
