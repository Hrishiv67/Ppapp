import { describe, expect, it } from 'vitest';
import { Rng } from '@/lib/engine/prng';
import { RunningMedian } from '@/lib/engine/running-median';
import { median } from '@/lib/engine/timing';

describe('RunningMedian', () => {
  it('matches a brute-force median and MAD over a sliding window', () => {
    const rng = new Rng(5);
    const capacity = 31;
    const rm = new RunningMedian(capacity);
    const all: number[] = [];
    for (let i = 0; i < 500; i++) {
      // Repeated values exercise the tie handling in the MAD merge.
      const v = i % 7 === 0 ? 1 : Math.round(rng.uniform(0, 20));
      rm.push(v);
      all.push(v);
      const win = all.slice(-capacity);
      const m = median(win);
      expect(rm.median()).toBe(m);
      expect(rm.mad()).toBe(median(win.map((x) => Math.abs(x - m))));
    }
  });
});
