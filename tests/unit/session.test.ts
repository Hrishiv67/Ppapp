import { describe, expect, it } from 'vitest';
import { RallySession, type SessionEvent } from '@/lib/engine/session';
import { synthesizeSession } from '@/lib/engine/synth';

const synth = synthesizeSession({
  seed: 41,
  durationSec: 90,
  sampleRate: 48000,
  neighbor: { levelDb: -16, periodRatio: 0.78 },
});

function run(chunk: number, onEvent?: (e: SessionEvent) => void) {
  const session = new RallySession({ sampleRate: synth.sampleRate, onEvent });
  for (let i = 0; i < synth.samples.length; i += chunk) session.push(synth.samples.subarray(i, i + chunk));
  return session;
}

describe('RallySession', () => {
  it('gives the same summary whatever the chunk size', () => {
    const a = run(128).finish();
    const b = run(4096).finish();
    const c = run(synth.samples.length).finish();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(a.rallyCount).toBe(synth.truth.rallies.length);
  });

  it('reports impacts and rallies live, in time order', () => {
    const events: SessionEvent[] = [];
    const session = run(2048, (e) => events.push(e));
    const impacts = events.filter((e) => e.type === 'impact');
    expect(impacts.length).toBeGreaterThan(synth.truth.events.length * 0.8);
    for (let i = 1; i < impacts.length; i++) expect(impacts[i].t).toBeGreaterThan(impacts[i - 1].t);
    for (const e of impacts) {
      expect(['hit', 'bounce', 'unknown']).toContain(e.kind);
      expect(e.probability).toBeGreaterThanOrEqual(0.5);
      expect(e.probability).toBeLessThanOrEqual(1);
    }
    const starts = events.filter((e) => e.type === 'rallyStart').length;
    const ends = events.filter((e) => e.type === 'rallyEnd');
    expect(starts).toBe(ends.length);
    expect(ends.filter((e) => e.rally !== null).length).toBeGreaterThanOrEqual(synth.truth.rallies.length - 1);
    expect(session.stats.rallyCount).toBe(ends.filter((e) => e.rally !== null).length);
  });

  it('passes user markers through to the summary', () => {
    const session = run(4096);
    session.mark('meds', 12.5);
    session.mark('water');
    const { markers } = session.finish();
    expect(markers).toEqual([
      { t: 12.5, label: 'meds' },
      { t: 90, label: 'water' },
    ]);
  });

  it('produces a plain-JSON summary', () => {
    const summary = run(4096).finish();
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    expect(summary).toMatchObject({ version: 1, sampleRate: 48000, durationSeconds: 90 });
    expect(summary.events.every((e) => e.t >= 0 && e.t <= 90)).toBe(true);
  });

  it('refuses audio after finish', () => {
    const session = run(4096);
    session.finish();
    expect(() => session.push(new Float32Array(128))).toThrow();
  });
});
