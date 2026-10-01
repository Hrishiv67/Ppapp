/**
 * Paddle hit vs table bounce, learned per session without labels.
 *
 * Every room, table, ball and paddle sounds different, so instead of a fixed
 * model we run 2-cluster k-means on this session's own impacts (standardized
 * log-centroid, log-decay and flatness) and then name the clusters.
 *
 * Naming rests on one physical assumption: paddle rubber and sponge absorb
 * high frequencies, so the paddle cluster is the one with the lower spectral
 * centroid. This holds in our synthetic model by construction; it is
 * plausible for real play but has not been validated on recordings yet. When
 * the two clusters are not clearly apart, or there are too few impacts, we
 * say "unknown" instead of guessing.
 */
import type { OnsetFeatures } from './features';

// k-means on fewer points than this is mostly noise.
export const MIN_EVENTS_TO_CLASSIFY = 16;
// Gap between the two centres, in units of the clusters' own spread along
// the line joining them. k-means always splits a single blob in two; for one
// Gaussian blob that split scores about 2.7, so we ask for clearly more.
const MIN_SEPARATION = 4;
// Spreads below these are measurement noise, not structure: 5% in centroid
// or decay, 0.02 in flatness. Without a floor, standardizing a near-constant
// feature would blow its noise up to the same weight as real differences.
const MIN_STD: Point = [0.05, 0.05, 0.02];
// Rallies alternate hits and bounces, so each cluster should hold a fair
// share; a tiny cluster is outliers, not a class.
const MIN_CLUSTER_SHARE = 0.2;
// Two clusters converge in a handful of steps; the cap only guards against cycling.
const MAX_ITERATIONS = 50;
// Floor before the log: decays this short are all "instant" to us.
const MIN_DECAY_MS = 0.5;
// Never report certainty: the decoder still weighs timing against this.
const MIN_PROBABILITY = 0.05;

export type Point = [number, number, number];

/** Null when the onset's decay could not be measured. */
export function classifierPoint(f: OnsetFeatures): Point | null {
  if (f.decayMs === null) return null;
  return [Math.log(f.centroidHz), Math.log(Math.max(f.decayMs, MIN_DECAY_MS)), f.flatness];
}

export interface PaddleModel {
  /** Standardization so each feature counts equally. */
  mean: Point;
  std: Point;
  paddle: Point;
  bounce: Point;
}

export interface KMeansResult {
  centers: [Point, Point];
  assignment: Uint8Array;
}

function dist2(a: Point, b: Point): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Lloyd's algorithm with k = 2. Without `init`, starts from the points with
 * the lowest and highest first coordinate so results are deterministic.
 */
export function kMeans2(points: Point[], init?: [Point, Point]): KMeansResult {
  let centers: [Point, Point];
  if (init) {
    centers = [[...init[0]], [...init[1]]];
  } else {
    let lo = points[0];
    let hi = points[0];
    for (const p of points) {
      if (p[0] < lo[0]) lo = p;
      if (p[0] > hi[0]) hi = p;
    }
    centers = [[...lo], [...hi]];
  }
  const assignment = new Uint8Array(points.length);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = iter === 0;
    for (let i = 0; i < points.length; i++) {
      const c = dist2(points[i], centers[0]) <= dist2(points[i], centers[1]) ? 0 : 1;
      if (c !== assignment[i]) changed = true;
      assignment[i] = c;
    }
    if (!changed) break;
    const sums: [Point, Point] = [[0, 0, 0], [0, 0, 0]];
    const counts = [0, 0];
    for (let i = 0; i < points.length; i++) {
      const c = assignment[i];
      counts[c]++;
      for (let d = 0; d < 3; d++) sums[c][d] += points[i][d];
    }
    for (let c = 0; c < 2; c++) {
      if (counts[c] > 0) centers[c] = sums[c].map((s) => s / counts[c]) as Point;
    }
  }
  return { centers, assignment };
}

/** Distance between centres over the pooled within-cluster spread along that axis. */
function separation(points: Point[], assignment: Uint8Array, centers: [Point, Point]): number {
  const gap = Math.sqrt(dist2(centers[0], centers[1]));
  if (gap === 0) return 0;
  const axis = centers[1].map((v, d) => (v - centers[0][d]) / gap);
  let sumSq = 0;
  for (let i = 0; i < points.length; i++) {
    const c = centers[assignment[i]];
    let along = 0;
    for (let d = 0; d < 3; d++) along += (points[i][d] - c[d]) * axis[d];
    sumSq += along * along;
  }
  const spread = Math.sqrt(sumSq / points.length);
  return spread > 0 ? gap / spread : Infinity;
}

function standardize(raw: Point[]): { mean: Point; std: Point; points: Point[] } {
  const mean: Point = [0, 0, 0];
  const std: Point = [0, 0, 0];
  for (const p of raw) for (let d = 0; d < 3; d++) mean[d] += p[d] / raw.length;
  for (const p of raw) for (let d = 0; d < 3; d++) std[d] += (p[d] - mean[d]) ** 2 / raw.length;
  for (let d = 0; d < 3; d++) std[d] = Math.max(Math.sqrt(std[d]), MIN_STD[d]);
  const points = raw.map((p) => p.map((v, d) => (v - mean[d]) / std[d]) as Point);
  return { mean, std, points };
}

/**
 * Fits the session model, or returns null when the data cannot support one.
 * Pass the previous model to warm-start, so labels stay stable as the
 * session grows instead of flipping when a refit lands in the other order.
 */
export function fitPaddleModel(features: OnsetFeatures[], previous?: PaddleModel | null): PaddleModel | null {
  const raw = features.map(classifierPoint).filter((p): p is Point => p !== null);
  if (raw.length < MIN_EVENTS_TO_CLASSIFY) return null;
  const { mean, std, points } = standardize(raw);
  const toStd = (p: Point) => p.map((v, d) => (v - mean[d]) / std[d]) as Point;
  const fromStd = (p: Point) => p.map((v, d) => v * std[d] + mean[d]) as Point;
  const init = previous ? ([toStd(previous.paddle), toStd(previous.bounce)] as [Point, Point]) : undefined;
  const { centers, assignment } = kMeans2(points, init);

  let n0 = 0;
  for (const a of assignment) if (a === 0) n0++;
  const minShare = Math.min(n0, points.length - n0) / points.length;
  if (minShare < MIN_CLUSTER_SHARE || separation(points, assignment, centers) < MIN_SEPARATION) return null;

  const paddleFirst = centers[0][0] <= centers[1][0];
  return {
    mean,
    std,
    paddle: fromStd(paddleFirst ? centers[0] : centers[1]),
    bounce: fromStd(paddleFirst ? centers[1] : centers[0]),
  };
}

/** P(paddle hit) from distances to the two centres; 0.5 when there is no model. */
export function paddleProbability(f: OnsetFeatures, model: PaddleModel | null): number {
  const p = classifierPoint(f);
  if (!model || !p) return 0.5;
  let dp = 0;
  let db = 0;
  for (let d = 0; d < 3; d++) {
    const v = (p[d] - model.mean[d]) / model.std[d];
    dp += (v - (model.paddle[d] - model.mean[d]) / model.std[d]) ** 2;
    db += (v - (model.bounce[d] - model.mean[d]) / model.std[d]) ** 2;
  }
  const prob = 1 / (1 + Math.exp((dp - db) / 2));
  return Math.min(1 - MIN_PROBABILITY, Math.max(MIN_PROBABILITY, prob));
}
