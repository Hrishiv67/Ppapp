import { describe, expect, it } from 'vitest';
import { scoreEvents, truthMetrics } from '@/lib/engine/evaluate';
import { RallySession } from '@/lib/engine/session';
import { synthesizeSession, type SynthOptions } from '@/lib/engine/synth';

function analyze(opts: SynthOptions) {
  const synth = synthesizeSession(opts);
  const session = new RallySession({ sampleRate: synth.sampleRate });
  for (let i = 0; i < synth.samples.length; i += 4096) session.push(synth.samples.subarray(i, i + 4096));
  return { synth, summary: session.finish() };
}

describe('engine end to end', () => {
  it('finds at least 95% of impacts in a quiet room', () => {
    const { synth, summary } = analyze({ seed: 51, durationSec: 180, sampleRate: 48000 });
    const score = scoreEvents(
      summary.events.map((e) => e.t),
      synth.truth.events.map((e) => e.t),
    );
    expect(score.f1).toBeGreaterThanOrEqual(0.95);
    expect(Math.abs(summary.rallyCount - synth.truth.rallies.length)).toBeLessThanOrEqual(1);
    expect(summary.hitsEstimated).toBe(false);
  });

  it('measures the Steady Window close to the ground truth', () => {
    const durationSec = 22 * 60;
    const { synth, summary } = analyze({
      seed: 52,
      durationSec,
      sampleRate: 16000,
      fatigue: { startMinutes: 10, cvPerMinute: 0.02 },
    });
    const truth = truthMetrics(synth.truth.events, durationSec).steadyWindow;
    expect(summary.steadyWindow.status).toBe('found');
    expect(truth.minutes).not.toBeNull();
    // The decline here is gradual (~2 rhythm points a minute), so a one-point
    // difference in a window score moves the crossing by ~30 s. Across seeds
    // the engine lands within ~2.5 min of the same metric on ground truth;
    // that is the resolution we claim, and the benchmark reports the mean.
    expect(Math.abs(summary.steadyWindow.minutes! - truth.minutes!)).toBeLessThan(2.5);
  });

  it('runs well faster than real time', () => {
    const synth = synthesizeSession({ seed: 53, durationSec: 60, sampleRate: 48000, talk: { levelDb: -26 } });
    const started = performance.now();
    const session = new RallySession({ sampleRate: synth.sampleRate });
    for (let i = 0; i < synth.samples.length; i += 2048) session.push(synth.samples.subarray(i, i + 2048));
    session.finish();
    const seconds = (performance.now() - started) / 1000;
    // A generous bound so slow CI machines pass; the benchmark prints the real factor.
    expect(seconds).toBeLessThan(6);
  });
});
