/**
 * Writes WAV fixtures for the Playwright fake-microphone tests, plus the
 * ground truth and what the engine reports for each file, to fixtures/.
 *
 *   npx tsx scripts/make-fixtures.ts
 *
 * Chrome plays these through --use-file-for-fake-audio-capture, so they are
 * 16-bit PCM mono at 48 kHz.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RallySession } from '../lib/engine/session';
import { synthesizeSession, type SynthOptions } from '../lib/engine/synth';
import { decodeWav, encodeWav } from '../lib/engine/wav';

const OUT_DIR = join(__dirname, '..', 'fixtures');
const SAMPLE_RATE = 48000;
const DURATION = 60;

const FIXTURES: Array<{ file: string; seed: number; options: Partial<SynthOptions> }> = [
  { file: 'rally-quiet.wav', seed: 101, options: {} },
  {
    file: 'rally-noisy.wav',
    seed: 102,
    options: {
      talk: { levelDb: -30 },
      music: { levelDb: -32 },
      claps: { perMinute: 4, levelDb: -18, applauseProbability: 0.3 },
      reverb: { rt60: 0.5, levelDb: -16 },
    },
  },
  { file: 'rally-neighbor.wav', seed: 103, options: { neighbor: { levelDb: -16, periodRatio: 0.78 } } },
];

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const index: Record<string, unknown> = {};
  for (const f of FIXTURES) {
    const synth = synthesizeSession({ seed: f.seed, durationSec: DURATION, sampleRate: SAMPLE_RATE, ...f.options });
    const wav = encodeWav(synth.samples, SAMPLE_RATE);
    writeFileSync(join(OUT_DIR, f.file), wav);

    // Analyze the file as written (after 16-bit rounding), the same audio the
    // browser will hear, so e2e tests can assert the numbers on screen.
    const session = new RallySession({ sampleRate: SAMPLE_RATE });
    session.push(decodeWav(wav).samples);
    const summary = session.finish();
    index[f.file] = {
      seed: f.seed,
      sampleRate: SAMPLE_RATE,
      durationSeconds: DURATION,
      options: f.options,
      truth: {
        rallyCount: synth.truth.rallies.length,
        totalHits: synth.truth.rallies.reduce((s, r) => s + r.hits, 0),
        rallies: synth.truth.rallies,
        events: synth.truth.events,
      },
      engine: {
        rallyCount: summary.rallyCount,
        totalHits: summary.totalHits,
        longestRally: summary.longestRally,
        activeSeconds: summary.activeSeconds,
      },
    };
    console.log(
      `${f.file}: ${synth.truth.rallies.length} rallies (engine ${summary.rallyCount}), ` +
        `${(wav.byteLength / 1e6).toFixed(1)} MB`,
    );
  }
  writeFileSync(join(OUT_DIR, 'truth.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`wrote ${join(OUT_DIR, 'truth.json')}`);
}

main();
