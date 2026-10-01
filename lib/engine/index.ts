/**
 * Public surface of the audio engine. The app should only need RallySession
 * and the types; the rest is exported for tests, scripts and tooling.
 */
export { RallySession } from './session';
export type { LiveImpactKind, LiveStats, RallySessionOptions, SessionEvent } from './session';
export type { Marker, SessionSummary, SummaryEvent } from './summary';
export type { Rally } from './rally';
export type { RhythmLabel, RhythmScore } from './rhythm';
export type { RhythmBlock, SteadyWindow } from './metrics';
export { MIXED_MIN_SCORE, STEADY_MIN_SCORE } from './rhythm';

export { DEFAULT_WEIGHTS, IMPACT_THRESHOLD, checkWeights, impactProbability } from './gate';
export type { GateWeights } from './gate';
export type { OnsetFeatures } from './features';
export { analyze } from './analyze';
export type { Analysis, Candidate } from './analyze';
export { OnsetExtractor } from './extractor';
export type { DescribedOnset } from './extractor';

export { synthesizeSession } from './synth';
export type { SynthOptions, SynthResult, TruthEvent, TruthRally } from './synth';
export { decodeWav, encodeWav } from './wav';
export type { DecodedWav } from './wav';
