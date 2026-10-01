import { describe, expect, it } from 'vitest';
import type { DecodedEvent } from '@/lib/engine/decode-types';
import { MIN_IMPACTS_PER_RALLY, segmentRallies } from '@/lib/engine/rally';

function events(times: number[], kinds?: Array<'hit' | 'bounce'>, inferredAt: number[] = []): DecodedEvent[] {
  return times.map((t, i) => {
    const kind = kinds?.[i] ?? (i % 2 === 0 ? 'hit' : 'bounce');
    return { t, kind, role: kind, inferred: inferredAt.includes(i), source: i };
  });
}

describe('rally segmentation', () => {
  it('splits on gaps longer than 2 s and keeps the rally edges', () => {
    const groups = segmentRallies(events([1, 1.5, 2, 2.6, 6, 6.5, 7.1, 7.6, 8.0]), true);
    expect(groups.map((g) => [g.rally.start, g.rally.end])).toEqual([
      [1, 2.6],
      [6, 8.0],
    ]);
  });

  it('treats exactly 2 s as the same rally', () => {
    expect(segmentRallies(events([1, 3, 5, 7]), true)).toHaveLength(1);
  });

  it(`needs at least ${MIN_IMPACTS_PER_RALLY} impacts to count`, () => {
    const groups = segmentRallies(events([1, 1.5, 10, 10.5, 11]), true);
    expect(groups).toHaveLength(1);
    expect(groups[0].rally.impacts).toBe(3);
  });

  it('counts paddle hits, including repaired ones', () => {
    const kinds: Array<'hit' | 'bounce'> = ['hit', 'bounce', 'bounce', 'hit', 'bounce', 'hit', 'bounce'];
    const [g] = segmentRallies(events([1, 1.2, 1.9, 2.4, 3.1, 3.6, 4.3], kinds, [5]), true);
    expect(g.rally).toMatchObject({ hits: 3, impacts: 7, inferred: 1, hitsEstimated: false });
  });

  it('estimates hits as half the impacts when hits and bounces are unknown', () => {
    const [g] = segmentRallies(events([1, 1.5, 2, 2.5, 3]), false);
    expect(g.rally).toMatchObject({ hits: 3, impacts: 5, hitsEstimated: true });
  });
});
