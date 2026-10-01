/**
 * Batch analysis of a session's described onsets: gate → loudness check →
 * hit/bounce clustering → rhythm decoding → rallies. Pure: the same
 * candidates always give the same result, which is what makes the final
 * summary independent of how the audio was chunked.
 */
import { fitPaddleModel, paddleProbability, type PaddleModel } from './classify';
import { decode } from './decode';
import type { DecodeInput, DecodedEvent } from './decode-types';
import type { OnsetFeatures } from './features';
import { IMPACT_THRESHOLD } from './gate';
import { segmentRallies, type RallyGroup } from './rally';
import { bootstrapTiming, learnTiming, type TimingModel } from './timing';

export interface Candidate {
  t: number;
  features: OnsetFeatures;
  /** Gate output. */
  pImpact: number;
}

// Your table is the closest one to the phone, so its impacts are the loudest
// impacts in the session. The 80th percentile of impact level sits on your
// table as long as it makes at least a fifth of all impact sounds.
const REFERENCE_QUANTILE = 0.8;
// A quantile of fewer impacts than this is mostly luck; skip the check until then.
const MIN_FOR_REFERENCE = 8;
// Impacts more than ~10 dB below that are another table (sound drops ~6 dB per
// doubling of distance, so 10 dB is roughly 3× farther away).
const LEVEL_DROP_DB = 10;
// Soft edge: a few dB either side of the cut-off is "maybe", not yes/no.
const LEVEL_SLOPE_DB = 2;
// The hand-set gate is often near 0 or 1, but it is not that reliable: music
// and claps can look like clicks. Capping its say means rhythm can still
// overrule it, so a run of off-beat "impacts" is rejected as a whole.
const MAX_GATE_TRUST = 0.9;
// Only confident impacts train the clusterer and seed the rhythm.
export const CONFIDENT = 0.6;
// Rounds of re-learning the timing from a decode and decoding again. The
// first round is where legs split into hit→bounce vs bounce→hit; the second
// lets serve legs settle once the rallies are found.
const TIMING_PASSES = 2;

export function levelReference(candidates: Candidate[]): number | null {
  const levels = candidates.filter((c) => c.pImpact >= IMPACT_THRESHOLD).map((c) => c.features.peakDb);
  if (levels.length < MIN_FOR_REFERENCE) return null;
  levels.sort((a, b) => a - b);
  return levels[Math.floor(REFERENCE_QUANTILE * (levels.length - 1))];
}

export function acceptProbability(c: Candidate, reference: number | null): number {
  const gate = Math.min(c.pImpact, MAX_GATE_TRUST);
  if (reference === null) return gate;
  const z = (c.features.peakDb - (reference - LEVEL_DROP_DB)) / LEVEL_SLOPE_DB;
  return gate / (1 + Math.exp(-z));
}

export interface Analysis {
  events: DecodedEvent[];
  groups: RallyGroup[];
  labelsKnown: boolean;
  paddleModel: PaddleModel | null;
  timing: TimingModel | null;
}

export interface AnalyzeOptions {
  /** Reuse a model instead of refitting (the live path refits only now and then). */
  paddleModel?: PaddleModel | null;
  reference?: number | null;
  timing?: TimingModel | null;
}

export function analyze(candidates: Candidate[], opts: AnalyzeOptions = {}): Analysis {
  const impacts = candidates.filter((c) => c.pImpact >= IMPACT_THRESHOLD);
  const reference = opts.reference !== undefined ? opts.reference : levelReference(impacts);
  const pAccept = impacts.map((c) => acceptProbability(c, reference));
  const confident = impacts.filter((_, i) => pAccept[i] >= CONFIDENT);
  const paddleModel =
    opts.paddleModel !== undefined ? opts.paddleModel : fitPaddleModel(confident.map((c) => c.features));
  const inputs: DecodeInput[] = impacts.map((c, i) => ({
    t: c.t,
    pAccept: pAccept[i],
    pPaddle: paddleProbability(c.features, paddleModel),
  }));

  let timing = opts.timing ?? bootstrapTiming(confident.map((c) => c.t));
  if (!timing) return { events: [], groups: [], labelsKnown: paddleModel !== null, paddleModel, timing: null };
  let events = decode(inputs, timing);
  if (!opts.timing) {
    for (let pass = 0; pass < TIMING_PASSES; pass++) {
      timing = learnTiming(events, timing);
      events = decode(inputs, timing);
    }
  }
  const labelsKnown = paddleModel !== null;
  return { events, groups: segmentRallies(events, labelsKnown), labelsKnown, paddleModel, timing };
}
