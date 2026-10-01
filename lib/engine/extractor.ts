/**
 * Streaming front end: audio in, located and described onsets out.
 * Owns the recent-audio ring buffer so features can look a little past the
 * onset; that look-ahead is the only latency (~0.15 s).
 */
import { SEGMENT_POST_SECONDS, SEGMENT_PRE_SECONDS, locateAndDescribe, type OnsetFeatures } from './features';
import { nextPowerOfTwo } from './fft';
import { OnsetDetector, type CoarseOnset } from './onset';

export interface DescribedOnset {
  /** Seconds since the first sample pushed. */
  t: number;
  strength: number;
  features: OnsetFeatures;
}

// Large pushes are cut into blocks so the ring never has to hold a whole file.
const BLOCK = 2048;
// Ring must cover one block plus the longest segment and the detector's
// peak-picking delay; one second is several times that at any rate.
const RING_SECONDS = 1;

export class OnsetExtractor {
  readonly sampleRate: number;
  private readonly detector: OnsetDetector;
  private readonly ring: Float32Array;
  private readonly mask: number;
  private readonly pre: number;
  private readonly post: number;
  private readonly frameSize: number;
  private written = 0;
  private pending: CoarseOnset[] = [];

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.detector = new OnsetDetector(sampleRate);
    this.frameSize = this.detector.config.frameSize;
    const size = nextPowerOfTwo(Math.ceil(RING_SECONDS * sampleRate));
    this.ring = new Float32Array(size);
    this.mask = size - 1;
    this.pre = Math.ceil(SEGMENT_PRE_SECONDS * sampleRate);
    this.post = Math.ceil(SEGMENT_POST_SECONDS * sampleRate);
  }

  /** Samples pushed so far, in seconds. */
  get time(): number {
    return this.written / this.sampleRate;
  }

  push(samples: Float32Array, onOnset: (o: DescribedOnset) => void): void {
    const queue = (o: CoarseOnset) => this.pending.push(o);
    for (let i = 0; i < samples.length; i += BLOCK) {
      const block = samples.subarray(i, Math.min(samples.length, i + BLOCK));
      for (let j = 0; j < block.length; j++) this.ring[(this.written + j) & this.mask] = block[j];
      this.written += block.length;
      this.detector.push(block, queue);
      this.resolvePending(onOnset);
    }
  }

  /** Pads with silence so onsets near the end still get their look-ahead. */
  flush(onOnset: (o: DescribedOnset) => void): void {
    const pad = this.frameSize * 2 + this.post + this.pre;
    this.push(new Float32Array(pad), onOnset);
  }

  private resolvePending(onOnset: (o: DescribedOnset) => void): void {
    while (this.pending.length > 0) {
      const o = this.pending[0];
      const from = o.frameStart - this.pre;
      const to = o.frameStart + this.frameSize + this.post;
      if (to > this.written) return;
      this.pending.shift();
      const seg = new Float32Array(to - from);
      for (let k = 0; k < seg.length; k++) {
        const abs = from + k;
        seg[k] = abs >= 0 ? this.ring[abs & this.mask] : 0;
      }
      const located = locateAndDescribe(seg, this.pre, this.pre + this.frameSize, this.sampleRate);
      onOnset({ t: (from + located.onset) / this.sampleRate, strength: o.strength, features: located.features });
    }
  }
}
