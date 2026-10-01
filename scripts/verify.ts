/**
 * Runs the fixed synthetic benchmark, prints a results table, writes
 * benchmark.json, and compares against lib/engine/benchmark.expected.json.
 *
 *   npx tsx scripts/verify.ts            compare (exit 1 on MISMATCH)
 *   npx tsx scripts/verify.ts --update   rewrite the expected file from this run
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS, runOnce, type RunResult } from './benchmark-suite';

type Row = Omit<RunResult, 'audioSeconds' | 'processSeconds'>;
type Report = Record<string, Row>;

const ROOT = join(__dirname, '..');
const EXPECTED = join(ROOT, 'lib/engine/benchmark.expected.json');
const OUTPUT = join(ROOT, 'benchmark.json');

// The engine is deterministic, so these only absorb floating-point
// differences between machines (a borderline onset flipping, say).
const TOLERANCE: Record<keyof Row, number> = {
  precision: 0.01,
  recall: 0.01,
  f1: 0.01,
  rallyCountError: 0.5,
  hitsPerRallyError: 0.1,
  activeMinutesError: 0.05,
  steadyWindowError: 0.3,
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x: number) => Math.round(x * 1000) / 1000;

function summarize(runs: RunResult[]): Row {
  const sw = runs.map((r) => r.steadyWindowError);
  return {
    precision: round(mean(runs.map((r) => r.precision))),
    recall: round(mean(runs.map((r) => r.recall))),
    f1: round(mean(runs.map((r) => r.f1))),
    rallyCountError: round(mean(runs.map((r) => r.rallyCountError))),
    hitsPerRallyError: round(mean(runs.map((r) => r.hitsPerRallyError))),
    activeMinutesError: round(mean(runs.map((r) => r.activeMinutesError))),
    // A missing Steady Window on either side is a failure, not a zero error.
    steadyWindowError: sw.every((x) => x === null) ? null : sw.some((x) => x === null) ? Infinity : round(mean(sw as number[])),
  };
}

function fmt(x: number | null, digits = 3): string {
  if (x === null) return '–';
  return Number.isFinite(x) ? x.toFixed(digits) : 'missing';
}

function main(): void {
  const update = process.argv.includes('--update');
  const report: Report = {};
  let audio = 0;
  let cpu = 0;
  console.log('scenario      rate   P      R      F1     rally±  hits±  active±min  steady±min');
  for (const s of SCENARIOS) {
    const runs = s.seeds.map((seed) => runOnce(s, seed));
    audio += runs.reduce((a, r) => a + r.audioSeconds, 0);
    cpu += runs.reduce((a, r) => a + r.processSeconds, 0);
    const row = summarize(runs);
    report[s.name] = row;
    console.log(
      [
        s.name.padEnd(12),
        String(s.sampleRate / 1000).padStart(5) + 'k',
        fmt(row.precision),
        fmt(row.recall),
        fmt(row.f1),
        fmt(row.rallyCountError, 2).padStart(6),
        fmt(row.hitsPerRallyError, 2).padStart(6),
        fmt(row.activeMinutesError, 2).padStart(10),
        fmt(row.steadyWindowError, 2).padStart(10),
      ].join(' '),
    );
  }
  console.log(`\nprocessed ${(audio / 60).toFixed(1)} min of audio in ${cpu.toFixed(1)} s (${(audio / cpu).toFixed(0)}× real time)`);
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');

  if (update) {
    writeFileSync(EXPECTED, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${EXPECTED}`);
    return;
  }
  if (!existsSync(EXPECTED)) {
    console.log('MISMATCH: no expected file; run with --update once the engine is final');
    process.exit(1);
  }
  const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as Report;
  const problems: string[] = [];
  for (const [name, row] of Object.entries(report)) {
    const want = expected[name];
    if (!want) {
      problems.push(`${name}: not in expected file`);
      continue;
    }
    for (const key of Object.keys(TOLERANCE) as Array<keyof Row>) {
      const got = row[key];
      const exp = want[key];
      const same = got === exp || (got !== null && exp !== null && Math.abs(got - exp) <= TOLERANCE[key]);
      if (!same) problems.push(`${name}.${key}: got ${fmt(got)}, expected ${fmt(exp)}`);
    }
  }
  for (const name of Object.keys(expected)) if (!report[name]) problems.push(`${name}: missing from this run`);
  if (problems.length) {
    console.log('MISMATCH');
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  console.log('MATCH');
}

main();
