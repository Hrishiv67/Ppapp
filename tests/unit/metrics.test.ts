import { describe, expect, it } from 'vitest';
import { truthMetrics } from '@/lib/engine/evaluate';
import { steadyWindow } from '@/lib/engine/metrics';
import { MIN_INTERVALS_FOR_SCORE, rhythmScore, robustCv } from '@/lib/engine/rhythm';
import { planSession } from '@/lib/engine/synth';

describe('rhythm score', () => {
  it('is 100 for a perfectly even beat', () => {
    expect(rhythmScore(new Array(20).fill(1.2))).toMatchObject({ score: 100, label: 'steady' });
  });

  it('is 100 × (1 − robust CV), labelled by the documented bands', () => {
    // Half the intervals 1.0, half 1.4: median 1.2 (mean of the middle pair), MAD 0.2.
    const dts = [...new Array(10).fill(1.0), ...new Array(10).fill(1.4)];
    expect(robustCv(dts)).toBeCloseTo((1.4826 * 0.2) / 1.2, 6);
    expect(rhythmScore(dts)).toMatchObject({ score: 75.3, label: 'mixed' });
  });

  it('ignores a single wild interval', () => {
    const dts = [...new Array(19).fill(1.2), 6];
    expect(rhythmScore(dts)?.score).toBe(100);
  });

  it('is clamped to 0 and needs a minimum of data', () => {
    const wild = Array.from({ length: 20 }, (_, i) => (i % 2 ? 0.2 : 3));
    expect(rhythmScore(wild)).toMatchObject({ score: 0, label: 'choppy' });
    expect(rhythmScore(new Array(MIN_INTERVALS_FOR_SCORE - 1).fill(1))).toBeNull();
  });
});

describe('Steady Window', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(SEEDS)('finds the drop when timing loosens late in a session (seed %i)', (seed) => {
    // Variability rises from minute 10 by 0.02 CV per minute; a 10-point
    // drop is reached around minute 15.
    const truth = planSession({ seed, durationSec: 22 * 60, fatigue: { startMinutes: 10, cvPerMinute: 0.02 } });
    const sw = truthMetrics(truth.events, 22 * 60).steadyWindow;
    expect(sw.status).toBe('found');
    expect(sw.minutes).toBeGreaterThan(12);
    expect(sw.minutes).toBeLessThan(18);
  });

  it.each(SEEDS)('reports that rhythm held when there is no fatigue (seed %i)', (seed) => {
    const truth = planSession({ seed, durationSec: 22 * 60 });
    expect(truthMetrics(truth.events, 22 * 60).steadyWindow).toMatchObject({ status: 'held', minutes: null });
  });

  it('returns null with a reason instead of a noisy number early on', () => {
    const truth = planSession({ seed: 9, durationSec: 3 * 60 });
    expect(truthMetrics(truth.events, 3 * 60).steadyWindow).toEqual({
      minutes: null,
      status: 'insufficient',
      reason: 'not enough play yet',
      baselineScore: null,
    });
    expect(steadyWindow([])).toMatchObject({ status: 'insufficient' });
  });
});

describe('session metrics', () => {
  it('adds up rally time, counts and tempo', () => {
    const truth = planSession({ seed: 10, durationSec: 5 * 60 });
    const m = truthMetrics(truth.events, 5 * 60);
    const active = truth.rallies.reduce((s, r) => s + r.end - r.start, 0);
    const hits = truth.rallies.reduce((s, r) => s + r.hits, 0);
    expect(m.rallyCount).toBe(truth.rallies.length);
    expect(m.activeSeconds).toBeCloseTo(active, 6);
    expect(m.totalHits).toBe(hits);
    expect(m.longestRally).toBe(Math.max(...truth.rallies.map((r) => r.hits)));
    expect(m.tempo).toBeCloseTo(hits / (active / 60), 6);
    expect(m.rhythmBlocks.map((b) => b.startMinute)).toEqual([0]);
    expect(m.rhythm?.label).toBe('steady');
  });
});
