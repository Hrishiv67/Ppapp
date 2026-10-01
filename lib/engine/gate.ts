/**
 * Impact gate: probability that an onset is a ball impact rather than speech,
 * music, a clap or a bump. Logistic regression over standardized features.
 *
 * The shipped defaults in weights.json were set by hand, not fit, from what
 * makes a ball click physically different:
 *  - logDecay (−): a 40 mm ball and a hard table stop ringing within ~20 ms;
 *    voices, notes and room-filling claps last far longer. Strongest cue.
 *    Unmeasurable (too close to the background) counts as neutral.
 *  - noisiness (−): flatness above "peaky". The ball and table ring at a few
 *    resonances; claps, fricatives ("s") and cymbals are noise. One-sided,
 *    because a peaky spectrum fits voices and music as well as a ball.
 *  - harmonicity (−): 10 ms after a click there is no pitch; talk and music
 *    have one. Weighted lightly because play often happens over talk.
 *  - offBand (−): how far the spectral centroid sits outside ~1.5–6 kHz.
 *    One-sided for the same reason as noisiness.
 *  - contrastDb (+): a click jumps far above what was sounding just before;
 *    a note in a song or a word in a sentence rises less abruptly.
 * Means sit where a feature stops being evidence either way; scales are a
 * typical spread. `scripts/train.ts` refits all of this from labeled WAVs.
 */
import defaults from './weights.json';
import type { OnsetFeatures } from './features';

export interface GateWeights {
  features: string[];
  mean: number[];
  scale: number[];
  weights: number[];
  bias: number;
}

/** Onsets at or above this probability are treated as impacts downstream. */
export const IMPACT_THRESHOLD = 0.5;

// Floor before the log: decays this short are all "instant" to us.
const MIN_DECAY_MS = 0.5;
// Ball clicks centre roughly between 1.5 and 6 kHz: 3 kHz ± one octave.
const CLICK_CENTER_HZ = 3000;
const CLICK_BAND_HALF_WIDTH = Math.LN2;
// Spectra flatter than this are noise-like. Below it a sound is "peaky",
// which fits a ball but also a voice or a note, so it earns no credit.
const TONAL_FLATNESS = 0.1;
// In a quiet room almost any sound jumps 40 dB over the silence before it,
// so more contrast than that says nothing about what the sound is.
const CONTRAST_CAP_DB = 40;

export const GATE_FEATURES = ['logDecay', 'noisiness', 'harmonicity', 'offBand', 'contrastDb'] as const;

/** Null entries are features that could not be measured for this onset. */
export function gateVector(f: OnsetFeatures): Array<number | null> {
  return [
    f.decayMs === null ? null : Math.log(Math.max(f.decayMs, MIN_DECAY_MS)),
    Math.max(0, f.flatness - TONAL_FLATNESS),
    f.harmonicity,
    Math.max(0, Math.abs(Math.log(f.centroidHz / CLICK_CENTER_HZ)) - CLICK_BAND_HALF_WIDTH),
    Math.min(f.contrastDb, CONTRAST_CAP_DB),
  ];
}

/** Weights files are edited by hand and by train.ts, so check they match this code. */
export function checkWeights(w: GateWeights): GateWeights {
  const n = GATE_FEATURES.length;
  const sameOrder = w.features.length === n && GATE_FEATURES.every((f, i) => w.features[i] === f);
  if (!sameOrder || w.mean.length !== n || w.scale.length !== n || w.weights.length !== n) {
    throw new Error(`Gate weights must list features ${GATE_FEATURES.join(', ')} in that order`);
  }
  return w;
}

export const DEFAULT_WEIGHTS: GateWeights = checkWeights(defaults);

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** An unmeasured feature adds nothing: it is scored as if at its mean. */
export function logisticScore(x: Array<number | null>, w: GateWeights): number {
  let z = w.bias;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v !== null) z += (w.weights[i] * (v - w.mean[i])) / w.scale[i];
  }
  return sigmoid(z);
}

export function impactProbability(f: OnsetFeatures, w: GateWeights = DEFAULT_WEIGHTS): number {
  return logisticScore(gateVector(f), w);
}
