import { describe, expect, it } from 'vitest';
import { OnsetExtractor } from '@/lib/engine/extractor';
import { DEFAULT_WEIGHTS, IMPACT_THRESHOLD, checkWeights, impactProbability } from '@/lib/engine/gate';
import { Rng } from '@/lib/engine/prng';
import { renderClap, renderImpact } from '@/lib/engine/synth-impact';
import { renderMusic } from '@/lib/engine/synth-music';
import { renderTalk } from '@/lib/engine/synth-voice';

const RATE = 48000;
const SECONDS = 30;

function withRoomNoise(seed: number): { x: Float32Array; rng: Rng } {
  const rng = new Rng(seed);
  const x = Float32Array.from({ length: RATE * SECONDS }, () => 0.0005 * rng.normal());
  return { x, rng };
}

function passRate(x: Float32Array): { n: number; rate: number } {
  const ex = new OnsetExtractor(RATE);
  const p: number[] = [];
  const add = (o: { features: Parameters<typeof impactProbability>[0] }) => p.push(impactProbability(o.features));
  ex.push(x, add);
  ex.flush(add);
  return { n: p.length, rate: p.filter((v) => v >= IMPACT_THRESHOLD).length / p.length };
}

describe('impact gate', () => {
  it('passes ball impacts', () => {
    const { x, rng } = withRoomNoise(1);
    for (let t = 1, i = 0; t < SECONDS - 1; t += 0.5, i++) {
      renderImpact(x, Math.round(t * RATE), RATE, i % 2 ? 'hit' : 'bounce', rng, {
        amplitude: 0.2,
        reverb: { rt60: 0.25, levelDb: -24 },
      });
    }
    const { n, rate } = passRate(x);
    expect(n).toBeGreaterThan(50);
    expect(rate).toBeGreaterThan(0.95);
  });

  it('rejects speech', () => {
    const { x, rng } = withRoomNoise(2);
    renderTalk(x, RATE, rng, -26, 0, SECONDS);
    expect(passRate(x).rate).toBeLessThan(0.05);
  });

  it('rejects music', () => {
    const { x, rng } = withRoomNoise(3);
    renderMusic(x, RATE, rng, -20, 0, SECONDS);
    expect(passRate(x).rate).toBeLessThan(0.1);
  });

  it('rejects most claps', () => {
    // Claps are the closest sound to a ball click; the rhythm decoder handles
    // the ones that slip through, so the gate only has to reject most.
    const { x, rng } = withRoomNoise(4);
    for (let t = 1; t < SECONDS - 1; t += 0.7) renderClap(x, Math.round(t * RATE), RATE, rng, 0.2);
    expect(passRate(x).rate).toBeLessThan(0.4);
  });

  it('refuses a weights file whose features do not match the code', () => {
    expect(() => checkWeights({ ...DEFAULT_WEIGHTS, features: ['flatness'] })).toThrow();
    expect(checkWeights(DEFAULT_WEIGHTS)).toBe(DEFAULT_WEIGHTS);
  });
});
