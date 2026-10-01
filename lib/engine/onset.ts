/**
 * Streaming onset detector tuned for ball impacts.
 *
 * Pipeline per hop: Hann-windowed FFT → log power in the 2–10 kHz band →
 * half-wave rectified spectral flux → compare with an adaptive threshold
 * (running median + k·MAD of recent flux) → peak pick with a refractory gap.
 * Coarse onsets are frame-accurate (~5 ms); `refineOnset` then finds the
 * sample-accurate start on the time-domain envelope.
 */
import { hannWindow, hzToBin, nextPowerOfTwo, realFft } from './fft';
import { RunningMedian } from './running-median';

// ~21 ms frames resolve a click while still giving ~47 Hz bins at 48 kHz.
const FRAME_SECONDS = 0.0213;
// 75% overlap: a 5 ms hop keeps coarse timing inside one refinement window.
const HOPS_PER_FRAME = 4;
// Ball clicks put most energy between 2 and 10 kHz; voices and music sit mostly
// below 2 kHz, so flux restricted to this band ignores most talk.
const BAND_LOW_HZ = 2000;
const BAND_HIGH_HZ = 10000;
// Keep the top band edge off Nyquist, where anti-alias filters roll off.
const NYQUIST_GUARD = 0.95;
// 1.5 s holds several rally beats, so the median tracks the room, not the ball.
const THRESHOLD_WINDOW_SECONDS = 1.5;
// Need this much history before the median means anything.
const MIN_HISTORY_SECONDS = 0.25;
// Spikes must clear the room's flux spread by this many MADs...
const MAD_MULTIPLIER = 4;
// ...and by a fixed rise, so near-digital silence (MAD ≈ 0) cannot trigger on dither.
const MIN_RISE_DB = 1.5;
// Two real impacts closer than this do not happen in a rally; it also stops
// one click from firing again on its own ringing.
const REFRACTORY_SECONDS = 0.045;
// A flux peak spans at most a few hops; cap the peak search so a long noisy
// stretch cannot hold the detector open.
const MAX_PEAK_FRAMES = 4;
// 20% of the way from background to envelope peak: low enough to catch the
// attack, high enough that background wiggles do not drag the time early.
const ONSET_LEVEL_FRACTION = 0.2;
// Per-hop smoothing of each bin's noise floor: falls within a few hops when
// the room gets quieter, takes ~1 s to rise, so clicks never lift it.
const FLOOR_FALL = 0.2;
const FLOOR_RISE = 0.005;
// Power below this (≈ −100 dBFS per bin) is treated as silence for the log.
const POWER_FLOOR = 1e-10;

export interface OnsetConfig {
  sampleRate: number;
  frameSize: number;
  hop: number;
  bandLowBin: number;
  bandHighBin: number;
}

export function onsetConfigFor(sampleRate: number): OnsetConfig {
  const frameSize = nextPowerOfTwo(Math.round(sampleRate * FRAME_SECONDS));
  const hop = frameSize / HOPS_PER_FRAME;
  const highHz = Math.min(BAND_HIGH_HZ, (sampleRate / 2) * NYQUIST_GUARD);
  return {
    sampleRate,
    frameSize,
    hop,
    bandLowBin: Math.max(1, hzToBin(BAND_LOW_HZ, frameSize, sampleRate)),
    bandHighBin: hzToBin(highHz, frameSize, sampleRate),
  };
}

export interface CoarseOnset {
  /** Absolute sample index of the first sample of the frame whose flux peaked. */
  frameStart: number;
  /** Flux above threshold, in dB; a rough confidence. */
  strength: number;
}

export class OnsetDetector {
  readonly config: OnsetConfig;
  private readonly window: Float32Array;
  private readonly frame: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly windowed: Float32Array;
  private readonly prevLog: Float32Array;
  private readonly curLog: Float32Array;
  private readonly noiseFloor: Float32Array;
  private readonly history: RunningMedian;
  private readonly minHistory: number;
  private readonly refractoryFrames: number;
  private readonly powerScale: number;
  private filled = 0;
  private frameIndex = 0;
  private havePrev = false;
  private peakFrame = -1;
  private peakExcess = 0;
  private peakLength = 0;
  private lastOnsetFrame = -Infinity;

  constructor(sampleRate: number) {
    this.config = onsetConfigFor(sampleRate);
    const { frameSize, hop, bandLowBin, bandHighBin } = this.config;
    this.window = hannWindow(frameSize);
    this.frame = new Float32Array(frameSize);
    this.re = new Float32Array(frameSize / 2 + 1);
    this.im = new Float32Array(frameSize / 2 + 1);
    this.windowed = new Float32Array(frameSize);
    const bandBins = bandHighBin - bandLowBin + 1;
    this.prevLog = new Float32Array(bandBins);
    this.curLog = new Float32Array(bandBins);
    this.noiseFloor = new Float32Array(bandBins);
    const framesPerSecond = sampleRate / hop;
    this.history = new RunningMedian(Math.round(THRESHOLD_WINDOW_SECONDS * framesPerSecond));
    this.minHistory = Math.round(MIN_HISTORY_SECONDS * framesPerSecond);
    this.refractoryFrames = Math.ceil(REFRACTORY_SECONDS * framesPerSecond);
    // A full-scale sine under a Hann window peaks at N/4 in magnitude; scaling
    // by that makes the log power read roughly in dBFS.
    this.powerScale = 1 / ((frameSize / 4) * (frameSize / 4));
  }

  /** Feed any number of samples; `onOnset` fires synchronously for each onset found. */
  push(samples: Float32Array, onOnset: (onset: CoarseOnset) => void): void {
    const { frameSize, hop } = this.config;
    const frame = this.frame;
    let i = 0;
    while (i < samples.length) {
      const take = Math.min(frameSize - this.filled, samples.length - i);
      frame.set(samples.subarray(i, i + take), this.filled);
      this.filled += take;
      i += take;
      if (this.filled === frameSize) {
        this.processFrame(onOnset);
        frame.copyWithin(0, hop);
        this.filled = frameSize - hop;
      }
    }
  }

  private processFrame(onOnset: (onset: CoarseOnset) => void): void {
    const { re, im, window, frame, windowed, curLog, prevLog } = this;
    const { bandLowBin, bandHighBin, hop } = this.config;
    for (let i = 0; i < frame.length; i++) windowed[i] = frame[i] * window[i];
    realFft(windowed, re, im);
    // Until the threshold has history, let the floor rise quickly too so it
    // has found the room level by the time detection starts.
    const rise = this.frameIndex < this.minHistory ? FLOOR_FALL : FLOOR_RISE;
    let flux = 0;
    for (let k = bandLowBin, j = 0; k <= bandHighBin; k++, j++) {
      const p = (re[k] * re[k] + im[k] * im[k]) * this.powerScale;
      // Track each bin's noise floor: drop fast, rise slowly, so it sits at
      // the room's steady level and ignores clicks. Adding it inside the log
      // compresses the random dips of noise bins, which would otherwise
      // rebound as fake "rises" and drown a click in a noisy room.
      const nf = this.noiseFloor[j];
      this.noiseFloor[j] = nf + (p < nf ? FLOOR_FALL : rise) * (p - nf);
      // 10·log10 written with the natural log, which is cheaper in V8.
      const db = 4.342944819 * Math.log(p + nf + POWER_FLOOR);
      curLog[j] = db;
      if (this.havePrev && db > prevLog[j]) flux += db - prevLog[j];
    }
    flux /= curLog.length;
    prevLog.set(curLog);
    this.havePrev = true;

    const index = this.frameIndex++;
    if (this.history.size >= this.minHistory) {
      const threshold = this.history.median() + MAD_MULTIPLIER * this.history.mad() + MIN_RISE_DB;
      this.pick(index, flux - threshold, hop, onOnset);
    }
    this.history.push(flux);
  }

  private pick(index: number, excess: number, hop: number, onOnset: (onset: CoarseOnset) => void): void {
    if (excess > 0 && index - this.lastOnsetFrame >= this.refractoryFrames) {
      if (this.peakFrame < 0 || excess > this.peakExcess) {
        if (this.peakFrame < 0) this.peakLength = 0;
        this.peakFrame = index;
        this.peakExcess = excess;
      }
      if (++this.peakLength < MAX_PEAK_FRAMES) return;
    }
    if (this.peakFrame >= 0) {
      onOnset({ frameStart: this.peakFrame * hop, strength: this.peakExcess });
      this.lastOnsetFrame = this.peakFrame;
      this.peakFrame = -1;
    }
  }
}

/**
 * Sample-accurate onset on an amplitude envelope: walk back from the envelope
 * peak to where it last sat near the pre-onset background. Walking back from
 * the peak (instead of forward from the frame start) means earlier noise
 * bumps in the frame cannot be mistaken for the start.
 *
 * @param env       amplitude envelope (high-passed so low rumble and voice do not count)
 * @param from, to  index range to search for the peak
 * @param bgFrom    start of the region used as background (just before `from`)
 * @returns index of the first sample of the impact
 */
export function refineOnset(env: Float32Array, from: number, to: number, bgFrom: number): number {
  let peak = from;
  for (let i = from + 1; i < to; i++) if (env[i] > env[peak]) peak = i;
  let bg = 0;
  const bgTo = Math.max(bgFrom + 1, from);
  for (let i = bgFrom; i < bgTo; i++) bg += env[i];
  bg /= bgTo - bgFrom;
  const level = bg + ONSET_LEVEL_FRACTION * (env[peak] - bg);
  let i = peak;
  while (i > bgFrom && env[i - 1] >= level) i--;
  return i;
}
