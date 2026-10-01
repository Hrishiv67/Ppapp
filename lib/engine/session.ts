/**
 * RallySession: the one object the app talks to. Feed it microphone audio as
 * it arrives; it calls back with impacts and rally boundaries as they happen,
 * and `finish()` returns the full summary.
 *
 * Live callbacks are provisional (they have only seen the past). The summary
 * re-analyzes the whole session at once, so it is the number of record, and
 * it is identical however the audio was chunked.
 */
import { CONFIDENT, acceptProbability, analyze, levelReference, type Candidate } from './analyze';
import { fitPaddleModel, paddleProbability, type PaddleModel } from './classify';
import type { DecodedEvent } from './decode-types';
import { OnsetExtractor, type DescribedOnset } from './extractor';
import { SEGMENT_POST_SECONDS } from './features';
import { DEFAULT_WEIGHTS, IMPACT_THRESHOLD, checkWeights, impactProbability, type GateWeights } from './gate';
import { computeMetrics } from './metrics';
import { MIN_IMPACTS_PER_RALLY, groupByGap, toRally, type Rally, type RallyGroup } from './rally';
import type { RhythmScore } from './rhythm';
import { buildSummary, type Marker, type SessionSummary } from './summary';
import { RALLY_GAP_SECONDS, bootstrapTiming, learnTiming, type TimingModel } from './timing';

export type LiveImpactKind = 'hit' | 'bounce' | 'unknown';

export type SessionEvent =
  | { type: 'impact'; t: number; kind: LiveImpactKind; probability: number; levelDb: number }
  | { type: 'rallyStart'; t: number }
  /** `rally` is null when what looked like a rally turned out not to be one. */
  | { type: 'rallyEnd'; rally: Rally | null };

export interface LiveStats {
  elapsedSeconds: number;
  activeSeconds: number;
  rallyCount: number;
  longestRally: number;
  inRally: boolean;
  currentRallyImpacts: number;
  rhythm: RhythmScore | null;
}

export interface RallySessionOptions {
  sampleRate: number;
  weights?: GateWeights;
  onEvent?: (event: SessionEvent) => void;
}

// Re-decode the open stretch twice a second: often enough that a rally end
// shows up promptly, rarely enough to cost nothing.
const LIVE_DECODE_SECONDS = 0.5;
// Refresh the loudness reference, hit/bounce clusters and rhythm seed after
// this many new likely impacts; refreshing on every decode would make the
// session cost grow with its length.
const REFRESH_EVERY = 16;
// Until there is any rhythm model, refresh sooner so the first rally is caught.
const REFRESH_EVERY_AT_START = 4;
// A live impact is announced once it is more likely yours than not.
const LIVE_IMPACT_MIN = 0.5;
// Only call a live impact a hit or bounce when the clusterer leans clearly.
const LIVE_KIND_MARGIN = 0.1;

export class RallySession {
  readonly sampleRate: number;
  private readonly extractor: OnsetExtractor;
  private readonly weights: GateWeights;
  private readonly onEvent: (event: SessionEvent) => void;
  private readonly candidates: Candidate[] = [];
  private readonly markers: Marker[] = [];
  private readonly done: RallyGroup[] = [];
  private readonly doneEvents: DecodedEvent[] = [];
  private paddleModel: PaddleModel | null = null;
  private reference: number | null = null;
  private timingSeed: TimingModel | null = null;
  private timing: TimingModel | null = null;
  private impactsSinceRefresh = 0;
  private openFrom = 0;
  private sinceDecode = 0;
  private announced = false;
  private currentImpacts = 0;
  private finished = false;

  constructor(opts: RallySessionOptions) {
    this.sampleRate = opts.sampleRate;
    this.extractor = new OnsetExtractor(opts.sampleRate);
    this.weights = checkWeights(opts.weights ?? DEFAULT_WEIGHTS);
    this.onEvent = opts.onEvent ?? (() => {});
  }

  get elapsedSeconds(): number {
    return this.extractor.time;
  }

  /** Mono samples in [−1, 1] at the session's sample rate, any chunk size. */
  push(samples: Float32Array): void {
    if (this.finished) throw new Error('RallySession.push called after finish()');
    this.extractor.push(samples, (o) => this.onOnset(o));
    this.sinceDecode += samples.length / this.sampleRate;
    if (this.sinceDecode >= LIVE_DECODE_SECONDS) {
      this.sinceDecode = 0;
      this.decodeOpen();
    }
  }

  /** Records a user marker such as "meds"; defaults to now. */
  mark(label: string, t: number = this.elapsedSeconds): void {
    this.markers.push({ t, label });
  }

  get stats(): LiveStats {
    const m = computeMetrics(this.done, this.paddleModel !== null, this.elapsedSeconds);
    return {
      elapsedSeconds: this.elapsedSeconds,
      activeSeconds: m.activeSeconds,
      rallyCount: m.rallyCount,
      longestRally: m.longestRally,
      inRally: this.announced,
      currentRallyImpacts: this.currentImpacts,
      rhythm: m.rhythm,
    };
  }

  /** Ends the session and analyzes all of it. The session cannot be pushed to afterwards. */
  finish(): SessionSummary {
    const duration = this.elapsedSeconds;
    this.extractor.flush((o) => this.onOnset(o));
    this.finished = true;
    const analysis = analyze(this.candidates);
    return buildSummary(analysis, duration, this.sampleRate, this.markers);
  }

  private onOnset(o: DescribedOnset): void {
    const c: Candidate = { t: o.t, features: o.features, pImpact: impactProbability(o.features, this.weights) };
    this.candidates.push(c);
    if (c.pImpact < IMPACT_THRESHOLD) return;
    if (++this.impactsSinceRefresh >= (this.timing ? REFRESH_EVERY : REFRESH_EVERY_AT_START)) this.refreshModels();
    const p = acceptProbability(c, this.reference);
    if (p < LIVE_IMPACT_MIN) return;
    const pp = paddleProbability(c.features, this.paddleModel);
    const kind: LiveImpactKind =
      !this.paddleModel || Math.abs(pp - 0.5) < LIVE_KIND_MARGIN ? 'unknown' : pp > 0.5 ? 'hit' : 'bounce';
    this.onEvent({ type: 'impact', t: c.t, kind, probability: p, levelDb: c.features.peakDb });
  }

  private refreshModels(): void {
    this.impactsSinceRefresh = 0;
    this.reference = levelReference(this.candidates);
    const confident = this.candidates.filter(
      (c) => c.pImpact >= IMPACT_THRESHOLD && acceptProbability(c, this.reference) >= CONFIDENT,
    );
    this.paddleModel = fitPaddleModel(confident.map((c) => c.features), this.paddleModel);
    this.timingSeed = bootstrapTiming(confident.map((c) => c.t));
    this.learnFromDone();
  }

  private learnFromDone(): void {
    this.timing = this.timingSeed && learnTiming(this.doneEvents, this.timingSeed);
  }

  /** Decodes everything since the last finished rally and reports what changed. */
  private decodeOpen(): void {
    // Candidates are complete up to the feature look-ahead behind the input.
    const now = this.elapsedSeconds - SEGMENT_POST_SECONDS;
    const timing = this.timing;
    if (!timing) return;
    const window = this.candidates.slice(this.openFrom);
    const { events } = analyze(window, { paddleModel: this.paddleModel, reference: this.reference, timing });
    let open: DecodedEvent[] | null = null;
    for (const g of groupByGap(events)) {
      const last = g[g.length - 1].t;
      if (now - last <= RALLY_GAP_SECONDS) {
        open = g;
        break;
      }
      if (g.length >= MIN_IMPACTS_PER_RALLY) {
        const group = { rally: toRally(g, this.paddleModel !== null), events: g };
        this.done.push(group);
        this.doneEvents.push(...g);
        this.learnFromDone();
        if (!this.announced) this.onEvent({ type: 'rallyStart', t: g[0].t });
        this.onEvent({ type: 'rallyEnd', rally: group.rally });
      } else if (this.announced) {
        this.onEvent({ type: 'rallyEnd', rally: null });
      }
      this.announced = false;
      this.advancePast(last);
    }
    if (open) {
      this.currentImpacts = open.length;
      if (open.length >= MIN_IMPACTS_PER_RALLY && !this.announced) {
        this.announced = true;
        this.onEvent({ type: 'rallyStart', t: open[0].t });
      }
    } else {
      this.currentImpacts = 0;
      // Nothing is open, so clicks older than one rally gap cannot join a
      // future rally; dropping them keeps each decode small.
      this.advancePast(now - RALLY_GAP_SECONDS);
    }
  }

  private advancePast(t: number): void {
    while (this.openFrom < this.candidates.length && this.candidates[this.openFrom].t <= t) this.openFrom++;
  }
}
