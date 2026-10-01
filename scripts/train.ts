/**
 * Fits the impact gate's logistic weights.
 *
 *   npx tsx scripts/train.ts <dir>          WAVs + Audacity label files
 *   npx tsx scripts/train.ts --synthetic    synthetic sessions instead
 *   options: --out <file> (default lib/engine/weights.json)
 *            --epochs <n> (default 3000)  --l2 <λ> (default 0.01)
 *
 * Label files sit next to each WAV with the same name and a .txt extension,
 * as Audacity exports them: start<TAB>end<TAB>label per line. Labels hit,
 * bounce, paddle, table or impact mark impacts; every other onset in the file
 * counts as not an impact, so label every impact you can hear.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { OnsetExtractor, type DescribedOnset } from '../lib/engine/extractor';
import { DEFAULT_WEIGHTS, GATE_FEATURES, gateVector, logisticScore, type GateWeights } from '../lib/engine/gate';
import { synthesizeSession, type SynthOptions } from '../lib/engine/synth';
import { decodeWav } from '../lib/engine/wav';

interface Example {
  x: Array<number | null>;
  y: 0 | 1;
}

const IMPACT_LABELS = new Set(['hit', 'bounce', 'paddle', 'table', 'impact']);
// An onset belongs to a label if it falls inside it, give or take this much.
const LABEL_SLACK_SECONDS = 0.03;
// Every fifth example is held out, so validation is spread over all files.
const VALIDATION_EVERY = 5;
const LEARNING_RATE = 0.5;

function onsets(samples: Float32Array, sampleRate: number): DescribedOnset[] {
  const ex = new OnsetExtractor(sampleRate);
  const out: DescribedOnset[] = [];
  ex.push(samples, (o) => out.push(o));
  ex.flush((o) => out.push(o));
  return out;
}

function parseLabels(text: string): Array<{ start: number; end: number; label: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length >= 3 && cols[0].trim() !== '' && !Number.isNaN(Number(cols[0])))
    .map(([s, e, l]) => ({ start: Number(s), end: Number(e), label: l.trim().toLowerCase() }));
}

function fromDirectory(dir: string): Example[] {
  const examples: Example[] = [];
  for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav'))) {
    const labelPath = join(dir, basename(file, file.slice(-4)) + '.txt');
    if (!existsSync(labelPath)) {
      console.warn(`skipping ${file}: no label file ${labelPath}`);
      continue;
    }
    const labels = parseLabels(readFileSync(labelPath, 'utf8'));
    const { samples, sampleRate } = decodeWav(readFileSync(join(dir, file)));
    for (const o of onsets(samples, sampleRate)) {
      const near = labels.find((l) => o.t >= l.start - LABEL_SLACK_SECONDS && o.t <= l.end + LABEL_SLACK_SECONDS);
      examples.push({ x: gateVector(o.features), y: near && IMPACT_LABELS.has(near.label) ? 1 : 0 });
    }
    console.log(`${file}: ${labels.length} labels`);
  }
  return examples;
}

function synthetic(): Example[] {
  const variants: Array<Partial<SynthOptions>> = [
    {},
    { talk: { levelDb: -24 } },
    { music: { levelDb: -20 } },
    { claps: { perMinute: 10, levelDb: -16, applauseProbability: 0.4 } },
    { reverb: { rt60: 0.8, levelDb: -12 } },
    { talk: { levelDb: -28 }, music: { levelDb: -26 } },
  ];
  const examples: Example[] = [];
  variants.forEach((v, i) => {
    // Seeds well away from the benchmark's, so training never sees test audio.
    const s = synthesizeSession({ seed: 1000 + i, durationSec: 120, sampleRate: i % 2 ? 44100 : 48000, ...v });
    const truth = s.truth.events.map((e) => e.t);
    for (const o of onsets(s.samples, s.sampleRate)) {
      const y = truth.some((t) => Math.abs(t - o.t) <= LABEL_SLACK_SECONDS) ? 1 : 0;
      examples.push({ x: gateVector(o.features), y });
    }
  });
  return examples;
}

function standardization(data: Example[]): { mean: number[]; scale: number[] } {
  const d = GATE_FEATURES.length;
  const mean: number[] = [];
  const scale: number[] = [];
  for (let k = 0; k < d; k++) {
    const vs = data.map((e) => e.x[k]).filter((v): v is number => v !== null);
    const m = vs.reduce((a, b) => a + b, 0) / vs.length;
    mean.push(m);
    scale.push(Math.sqrt(vs.reduce((a, v) => a + (v - m) ** 2, 0) / vs.length) || 1);
  }
  return { mean, scale };
}

/** Batch gradient descent on class-balanced log loss with L2 on the weights (not the bias). */
function fit(train: Example[], epochs: number, l2: number): GateWeights {
  const { mean, scale } = standardization(train);
  const d = GATE_FEATURES.length;
  const w = new Array<number>(d).fill(0);
  let b = 0;
  const positives = train.filter((e) => e.y === 1).length;
  // Balance classes so a session full of talk does not teach "never an impact".
  const weightOf = (y: number) => (y === 1 ? train.length / (2 * positives) : train.length / (2 * (train.length - positives)));
  // Unmeasured features sit at the mean (0 after standardizing), matching
  // how the gate scores them.
  const z = train.map((e) => e.x.map((v, k) => (v === null ? 0 : (v - mean[k]) / scale[k])));
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < train.length; i++) {
      let s = b;
      for (let k = 0; k < d; k++) s += w[k] * z[i][k];
      const err = (1 / (1 + Math.exp(-s)) - train[i].y) * weightOf(train[i].y);
      for (let k = 0; k < d; k++) gw[k] += err * z[i][k];
      gb += err;
    }
    for (let k = 0; k < d; k++) w[k] -= LEARNING_RATE * (gw[k] / train.length + l2 * w[k]);
    b -= (LEARNING_RATE * gb) / train.length;
  }
  return { features: [...GATE_FEATURES], mean, scale, weights: w, bias: b };
}

function accuracy(data: Example[], w: GateWeights): number {
  const correct = data.filter((e) => (logisticScore(e.x, w) >= 0.5 ? 1 : 0) === e.y).length;
  return data.length ? correct / data.length : NaN;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): void {
  const useSynthetic = process.argv.includes('--synthetic');
  const dir = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!useSynthetic && !dir) {
    console.error('usage: tsx scripts/train.ts <dir-with-wav-and-labels> | --synthetic [--out file]');
    process.exit(2);
  }
  const out = arg('--out', join(__dirname, '..', 'lib/engine/weights.json'));
  const epochs = Number(arg('--epochs', '3000'));
  const l2 = Number(arg('--l2', '0.01'));

  const data = useSynthetic ? synthetic() : fromDirectory(dir as string);
  const train = data.filter((_, i) => i % VALIDATION_EVERY !== 0);
  const validation = data.filter((_, i) => i % VALIDATION_EVERY === 0);
  const positives = data.filter((e) => e.y === 1).length;
  console.log(`${data.length} onsets (${positives} impacts), ${train.length} train / ${validation.length} validation`);
  if (positives === 0 || positives === data.length) {
    console.error('need both impacts and non-impacts to train');
    process.exit(1);
  }

  const w = fit(train, epochs, l2);
  console.log(`hand-set defaults: train ${accuracy(train, DEFAULT_WEIGHTS).toFixed(3)}  validation ${accuracy(validation, DEFAULT_WEIGHTS).toFixed(3)}`);
  console.log(`fitted:            train ${accuracy(train, w).toFixed(3)}  validation ${accuracy(validation, w).toFixed(3)}`);
  const source = useSynthetic ? 'fitted by scripts/train.ts on synthetic sessions' : `fitted by scripts/train.ts on ${dir}`;
  const round = (xs: number[]) => xs.map((v) => Math.round(v * 1e4) / 1e4);
  const json = { source, features: w.features, mean: round(w.mean), scale: round(w.scale), weights: round(w.weights), bias: Math.round(w.bias * 1e4) / 1e4 };
  writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  console.log(`wrote ${out}`);
}

main();
