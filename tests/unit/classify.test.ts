import { describe, expect, it } from 'vitest';
import { MIN_EVENTS_TO_CLASSIFY, fitPaddleModel, paddleProbability } from '@/lib/engine/classify';
import { OnsetExtractor, type DescribedOnset } from '@/lib/engine/extractor';
import { synthesizeSession } from '@/lib/engine/synth';

function labeledOnsets(seed: number) {
  const s = synthesizeSession({ seed, durationSec: 90, sampleRate: 44100 });
  const ex = new OnsetExtractor(s.sampleRate);
  const found: DescribedOnset[] = [];
  ex.push(s.samples, (o) => found.push(o));
  ex.flush((o) => found.push(o));
  return s.truth.events.flatMap((e) => {
    const o = found.find((f) => Math.abs(f.t - e.t) < 0.01);
    return o ? [{ kind: e.kind, features: o.features }] : [];
  });
}

describe('paddle vs bounce clustering', () => {
  it('separates paddle hits from table bounces without labels', () => {
    const events = labeledOnsets(31);
    const model = fitPaddleModel(events.map((e) => e.features));
    expect(model).not.toBeNull();
    const correct = events.filter((e) => (paddleProbability(e.features, model) > 0.5 ? 'hit' : 'bounce') === e.kind);
    expect(correct.length / events.length).toBeGreaterThan(0.95);
  });

  it('says unknown with too few impacts', () => {
    const events = labeledOnsets(32).slice(0, MIN_EVENTS_TO_CLASSIFY - 1);
    const model = fitPaddleModel(events.map((e) => e.features));
    expect(model).toBeNull();
    expect(paddleProbability(events[0].features, model)).toBe(0.5);
  });

  it('says unknown when there is only one kind of sound', () => {
    const bounces = labeledOnsets(33).filter((e) => e.kind === 'bounce');
    expect(bounces.length).toBeGreaterThanOrEqual(MIN_EVENTS_TO_CLASSIFY);
    expect(fitPaddleModel(bounces.map((e) => e.features))).toBeNull();
  });

  it('keeps its labels when refit on a growing session', () => {
    const events = labeledOnsets(34);
    const early = fitPaddleModel(events.slice(0, 30).map((e) => e.features));
    const later = fitPaddleModel(events.map((e) => e.features), early);
    expect(early && later).toBeTruthy();
    // Paddle stays the duller cluster after the refit.
    expect(later!.paddle[0]).toBeLessThan(later!.bounce[0]);
    expect(Math.abs(later!.paddle[0] - early!.paddle[0])).toBeLessThan(0.3);
  });
});
