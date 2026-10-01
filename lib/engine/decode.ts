/**
 * Viterbi decoding of candidate impacts against a small rally grammar.
 *
 * Each candidate is either part of your rally (in one of five roles) or
 * spurious. A rally reads:
 *
 *   serve → serveBounce → serveCross → hit → bounce → hit → bounce → …
 *
 * The decoder picks the cheapest labelling, where cost = −log probability:
 *  - accepting a candidate costs −log pAccept plus −log P(role's kind);
 *  - skipping it as spurious costs −log(1 − pAccept);
 *  - each step between accepted impacts is priced by how well its interval
 *    fits the session's own expected interval for that step, compared with
 *    a click arriving at a random time (see logNormalCost).
 * A neighbor table's clicks land at the wrong times, so fitting them into
 * your rhythm costs more than skipping them. A single missed impact is
 * repaired by allowing hit→hit or bounce→bounce at one full beat, for a
 * fixed price, and inserting the event that must have happened.
 */
import type { DecodeInput, DecodedEvent, Role } from './decode-types';
import { RALLY_GAP_SECONDS, type TimingModel } from './timing';

const ROLES: Role[] = ['serve', 'serveBounce', 'serveCross', 'hit', 'bounce'];
const IS_HIT = [true, false, false, true, false];
const SERVE = 0;
const SERVE_BOUNCE = 1;
const SERVE_CROSS = 2;
const HIT = 3;
const BOUNCE = 4;
const STATES = ROLES.length;

// Opening a rally must be paid for, or every stray click becomes a 1-impact rally.
const START_COST = 2;
// Rallies normally open with a serve; starting mid-rally means we missed it.
const LATE_START_COST = 1;
// Price of repairing one unheard impact. Roughly the skip cost of a confident
// candidate, so a gap is only repaired when the timing clearly says so.
const MISS_COST = 2.5;
// Players sometimes serve again within 2 s of the last rally ending.
const EARLY_RESTART_COST = 3;
// Serve legs vary more than rally legs (spin, placement).
const SERVE_SPREAD = 0.35;
// How many earlier candidates an accepted one may link back to; the ones in
// between are skipped. Covers several interleaved neighbor-table clicks.
const MAX_LOOKBACK = 10;
// No candidate is ever certain either way; keeps every log finite.
const P_FLOOR = 0.01;
// Share and width of the loose-timing component of the rhythm model.
const WIDE_WEIGHT = 0.25;
const WIDE_SPREAD_FACTOR = 3;
const WIDE_SPREAD_MIN = 0.35;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** One allowed move in the grammar, priced against the session's timing. */
interface Transition {
  expected: number;
  spread: number;
  /** MISS_COST when this move implies an unheard impact in between. */
  extra: number;
  /** Role of the impact inserted between the two, or null. */
  insert: Role | null;
  /** Where the inserted event falls, as a fraction of the interval. */
  at: number;
}

/**
 * −log of how much likelier this interval is under the rhythm than for a
 * click at a random moment (uniform over the rally gap). Negative when the
 * interval fits: being on the beat is evidence in its own right, which keeps
 * a slightly quiet or odd-sounding impact in the rally.
 *
 * The rhythm density is a log-normal around the expected leg plus a wide
 * component. Without the wide part, a player whose timing loosens late in a
 * session would have their off-beat hits thrown out, and the rhythm score
 * would look steadier than the play was — the opposite of what we need to
 * measure.
 */
function logNormalCost(dt: number, expected: number, spread: number): number {
  const x = Math.log(dt / expected);
  const wide = Math.max(WIDE_SPREAD_FACTOR * spread, WIDE_SPREAD_MIN);
  const density =
    ((1 - WIDE_WEIGHT) * Math.exp((-0.5 * x * x) / (spread * spread))) / spread +
    (WIDE_WEIGHT * Math.exp((-0.5 * x * x) / (wide * wide))) / wide;
  return Math.log((dt * SQRT_2PI) / RALLY_GAP_SECONDS) - Math.log(density);
}

/** Table indexed by from * STATES + to; null where the grammar forbids the move. */
function transitionTable(m: TimingModel): Array<Transition | null> {
  const table = new Array<Transition | null>(STATES * STATES).fill(null);
  const s = m.spread;
  const beat = m.hitToBounce + m.bounceToHit;
  const serveLegs = m.serveBounce + m.serveCross;
  const crossToHit = m.serveCross + m.bounceToHit;
  const leg = (from: number, to: number, expected: number, spread: number) => {
    table[from * STATES + to] = { expected, spread, extra: 0, insert: null, at: 0 };
  };
  const repair = (from: number, to: number, expected: number, spread: number, insert: Role, at: number) => {
    table[from * STATES + to] = { expected, spread, extra: MISS_COST, insert, at };
  };
  leg(SERVE, SERVE_BOUNCE, m.serveBounce, SERVE_SPREAD);
  repair(SERVE, SERVE_CROSS, serveLegs, SERVE_SPREAD, 'serveBounce', m.serveBounce / serveLegs);
  leg(SERVE_BOUNCE, SERVE_CROSS, m.serveCross, SERVE_SPREAD);
  repair(SERVE_BOUNCE, HIT, crossToHit, SERVE_SPREAD, 'serveCross', m.serveCross / crossToHit);
  leg(SERVE_CROSS, HIT, m.bounceToHit, s);
  leg(BOUNCE, HIT, m.bounceToHit, s);
  leg(HIT, BOUNCE, m.hitToBounce, s);
  repair(HIT, HIT, beat, s, 'bounce', m.hitToBounce / beat);
  repair(SERVE_CROSS, BOUNCE, beat, s, 'hit', m.bounceToHit / beat);
  repair(BOUNCE, BOUNCE, beat, s, 'hit', m.bounceToHit / beat);
  return table;
}

function startCost(state: number): number {
  if (state === SERVE) return START_COST;
  if (state === SERVE_CROSS) return Infinity;
  return START_COST + LATE_START_COST;
}

const clampP = (p: number) => Math.min(1 - P_FLOOR, Math.max(P_FLOOR, p));

export function decode(inputs: DecodeInput[], m: TimingModel): DecodedEvent[] {
  const n = inputs.length;
  const S = STATES;
  const skip = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) skip[j + 1] = skip[j] - Math.log(1 - clampP(inputs[j].pAccept));
  const cost = new Float64Array(n * S).fill(Infinity);
  const backIndex = new Int32Array(n * S).fill(-1);
  const backState = new Int8Array(n * S);
  const table = transitionTable(m);
  // Index into `table` of the move that reached each state, or −1 for a start.
  const backMove = new Int8Array(n * S).fill(-1);
  const bestEnd = new Float64Array(n).fill(Infinity);
  const bestEndState = new Int8Array(n);

  // Cheapest way to have closed an earlier rally more than RALLY_GAP before j
  // (0 with index −1 means nothing was accepted at all).
  let resetFrom = 0;
  let resetVal = 0;
  let resetIndex = -1;

  for (let j = 0; j < n; j++) {
    const tj = inputs[j].t;
    while (resetFrom < j && tj - inputs[resetFrom].t > RALLY_GAP_SECONDS) {
      const v = bestEnd[resetFrom] - skip[resetFrom + 1];
      if (v < resetVal) {
        resetVal = v;
        resetIndex = resetFrom;
      }
      resetFrom++;
    }
    const startBase = skip[j] + resetVal;
    const pa = clampP(inputs[j].pAccept);
    const pp = clampP(inputs[j].pPaddle);

    for (let s = 0; s < S; s++) {
      let best = startBase + startCost(s);
      let bi = resetIndex;
      let bs = resetIndex >= 0 ? bestEndState[resetIndex] : 0;
      let bmove = -1;
      for (let i = j - 1; i >= Math.max(0, j - MAX_LOOKBACK); i--) {
        const dt = tj - inputs[i].t;
        if (dt > RALLY_GAP_SECONDS) break;
        const between = skip[j] - skip[i + 1];
        if (s === SERVE) {
          const c = bestEnd[i] + between + START_COST + EARLY_RESTART_COST;
          if (c < best) {
            best = c;
            bi = i;
            bs = bestEndState[i];
            bmove = -1;
          }
          continue;
        }
        for (let sp = 0; sp < S; sp++) {
          const prev = cost[i * S + sp];
          const move = sp * S + s;
          const tr = table[move];
          if (prev === Infinity || !tr) continue;
          const c = prev + between + logNormalCost(dt, tr.expected, tr.spread) + tr.extra;
          if (c < best) {
            best = c;
            bi = i;
            bs = sp;
            bmove = move;
          }
        }
      }
      const emit = -Math.log(pa) - Math.log(IS_HIT[s] ? pp : 1 - pp);
      cost[j * S + s] = best + emit;
      backIndex[j * S + s] = bi;
      backState[j * S + s] = bs;
      backMove[j * S + s] = bmove;
      if (best + emit < bestEnd[j]) {
        bestEnd[j] = best + emit;
        bestEndState[j] = s;
      }
    }
  }

  let total = skip[n];
  let endIndex = -1;
  for (let j = 0; j < n; j++) {
    const c = bestEnd[j] + skip[n] - skip[j + 1];
    if (c < total) [total, endIndex] = [c, j];
  }
  return backtrack(inputs, endIndex, endIndex >= 0 ? bestEndState[endIndex] : 0, backIndex, backState, backMove, table);
}

function backtrack(
  inputs: DecodeInput[],
  endIndex: number,
  endState: number,
  backIndex: Int32Array,
  backState: Int8Array,
  backMove: Int8Array,
  table: Array<Transition | null>,
): DecodedEvent[] {
  const S = STATES;
  const out: DecodedEvent[] = [];
  let j = endIndex;
  let s = endState;
  while (j >= 0) {
    const k = j * S + s;
    out.push({ t: inputs[j].t, kind: IS_HIT[s] ? 'hit' : 'bounce', role: ROLES[s], inferred: false, source: j });
    const prev = backIndex[k];
    const st = backMove[k] >= 0 ? table[backMove[k]] : null;
    if (st?.insert && prev >= 0) {
      const t = inputs[prev].t + st.at * (inputs[j].t - inputs[prev].t);
      out.push({ t, kind: st.insert === 'hit' ? 'hit' : 'bounce', role: st.insert, inferred: true, source: -1 });
    }
    s = backState[k];
    j = prev;
  }
  return out.reverse();
}
