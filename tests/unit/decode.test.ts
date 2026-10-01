import { describe, expect, it } from 'vitest';
import { decode } from '@/lib/engine/decode';
import type { DecodeInput } from '@/lib/engine/decode-types';
import type { TimingModel } from '@/lib/engine/timing';

const TIMING: TimingModel = { hitToBounce: 0.74, bounceToHit: 0.46, serveBounce: 0.17, serveCross: 0.7, spread: 0.1 };

/** Serve, two serve bounces, then alternating hit/bounce at the model's legs. */
function rally(start: number, impacts: number): Array<{ t: number; kind: 'hit' | 'bounce' }> {
  const out: Array<{ t: number; kind: 'hit' | 'bounce' }> = [
    { t: start, kind: 'hit' },
    { t: start + TIMING.serveBounce, kind: 'bounce' },
    { t: start + TIMING.serveBounce + TIMING.serveCross, kind: 'bounce' },
  ];
  while (out.length < impacts) {
    const last = out[out.length - 1];
    const kind = last.kind === 'bounce' ? 'hit' : 'bounce';
    out.push({ t: last.t + (kind === 'hit' ? TIMING.bounceToHit : TIMING.hitToBounce), kind });
  }
  return out;
}

const asInput = (e: { t: number; kind: 'hit' | 'bounce' }): DecodeInput => ({
  t: e.t,
  pAccept: 0.85,
  pPaddle: e.kind === 'hit' ? 0.9 : 0.1,
});

describe('rally decoder', () => {
  it('labels a clean rally with serve, bounces and hits', () => {
    const truth = rally(1, 12);
    const out = decode(truth.map(asInput), TIMING);
    expect(out.map((e) => e.kind)).toEqual(truth.map((e) => e.kind));
    expect(out.slice(0, 3).map((e) => e.role)).toEqual(['serve', 'serveBounce', 'serveCross']);
    expect(out.some((e) => e.inferred)).toBe(false);
  });

  it('repairs a single missed bounce', () => {
    const truth = rally(1, 12);
    const missing = truth[8];
    expect(missing.kind).toBe('bounce');
    const out = decode(truth.filter((e) => e !== missing).map(asInput), TIMING);
    expect(out).toHaveLength(truth.length);
    const filled = out.filter((e) => e.inferred);
    expect(filled).toHaveLength(1);
    expect(filled[0].kind).toBe('bounce');
    expect(Math.abs(filled[0].t - missing.t)).toBeLessThan(0.1);
  });

  it('repairs a single missed paddle hit, so the hit count survives', () => {
    const truth = rally(1, 12);
    const missing = truth[7];
    expect(missing.kind).toBe('hit');
    const out = decode(truth.filter((e) => e !== missing).map(asInput), TIMING);
    expect(out.filter((e) => e.kind === 'hit')).toHaveLength(truth.filter((e) => e.kind === 'hit').length);
  });

  it("rejects a neighbor table's clicks that fall off your rhythm", () => {
    const truth = rally(1, 14);
    // A neighbor rally at a different tempo, interleaved with yours and a
    // bit quieter, so the gate and loudness alone rate them 0.6.
    const neighbor: DecodeInput[] = [];
    for (let t = 1.29; t < truth[truth.length - 1].t; t += 0.93) neighbor.push({ t, pAccept: 0.6, pPaddle: 0.5 });
    const inputs = [...truth.map(asInput), ...neighbor].sort((a, b) => a.t - b.t);
    const out = decode(inputs, TIMING);
    const accepted = out.filter((e) => !e.inferred).map((e) => inputs[e.source].t);
    expect(accepted).toEqual(truth.map((e) => e.t));
  });

  it('starts a new rally after a long pause', () => {
    const first = rally(1, 7);
    const second = rally(first[first.length - 1].t + 6, 7);
    const out = decode([...first, ...second].map(asInput), TIMING);
    expect(out).toHaveLength(14);
    expect(out[7].role).toBe('serve');
  });

  it('drops a lone click', () => {
    expect(decode([{ t: 3, pAccept: 0.6, pPaddle: 0.5 }], TIMING)).toEqual([]);
  });
});
