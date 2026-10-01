import { describe, expect, it } from 'vitest';
import { planSession, synthesizeSession } from '@/lib/engine/synth';

describe('synthetic sessions', () => {
  it('are identical for the same seed and differ for another', () => {
    const a = synthesizeSession({ seed: 5, durationSec: 20, sampleRate: 16000, talk: { levelDb: -26 } });
    const b = synthesizeSession({ seed: 5, durationSec: 20, sampleRate: 16000, talk: { levelDb: -26 } });
    const c = synthesizeSession({ seed: 6, durationSec: 20, sampleRate: 16000, talk: { levelDb: -26 } });
    expect(b.samples).toEqual(a.samples);
    expect(b.truth).toEqual(a.truth);
    expect(c.truth).not.toEqual(a.truth);
  });

  it('match the truth-only planner', () => {
    const opts = { seed: 7, durationSec: 60, sampleRate: 16000 };
    expect(planSession(opts)).toEqual(synthesizeSession(opts).truth);
  });

  it('produce well-formed rallies that start with a serve', () => {
    const { truth, samples, sampleRate } = synthesizeSession({ seed: 8, durationSec: 120, sampleRate: 44100 });
    expect(samples.length).toBe(120 * 44100);
    expect(sampleRate).toBe(44100);
    for (let i = 1; i < truth.events.length; i++) expect(truth.events[i].t).toBeGreaterThan(truth.events[i - 1].t);
    for (const r of truth.rallies) {
      const inRally = truth.events.filter((e) => e.t >= r.start && e.t <= r.end);
      expect(inRally.map((e) => e.kind).slice(0, 3)).toEqual(['hit', 'bounce', 'bounce']);
      expect(inRally.length).toBe(r.impacts);
      expect(inRally.filter((e) => e.kind === 'hit').length).toBe(r.hits);
    }
  });

  it('keep the neighbor table out of the truth', () => {
    const alone = planSession({ seed: 9, durationSec: 60 });
    const withNeighbor = synthesizeSession({
      seed: 9,
      durationSec: 60,
      sampleRate: 16000,
      neighbor: { levelDb: -16, periodRatio: 0.78 },
    });
    expect(withNeighbor.truth).toEqual(alone);
  });
});
