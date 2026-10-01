/**
 * AudioWorklet that hands microphone audio to the main thread, where
 * RallySession analyzes it. Kept minimal on purpose: the audio thread must
 * never stall, so all analysis happens elsewhere.
 *
 * Posts { samples: Float32Array } every CHUNK_FRAMES frames (mono: the first
 * input channel; a phone mic is mono and stereo would only double the work).
 * Register with: audioContext.audioWorklet.addModule('/worklets/capture.js')
 * then new AudioWorkletNode(audioContext, 'rallybeat-capture').
 */

// 2048 frames is ~43 ms at 48 kHz: few enough messages to be cheap, small
// enough that impacts appear on screen without visible delay.
const CHUNK_FRAMES = 2048;

class RallyBeatCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_FRAMES);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    // No input yet (e.g. mic still starting); keep the node alive.
    if (!channel) return true;
    let read = 0;
    while (read < channel.length) {
      const take = Math.min(CHUNK_FRAMES - this.filled, channel.length - read);
      this.buffer.set(channel.subarray(read, read + take), this.filled);
      this.filled += take;
      read += take;
      if (this.filled === CHUNK_FRAMES) {
        // Transfer the buffer instead of copying it, then start a fresh one.
        this.port.postMessage({ samples: this.buffer }, [this.buffer.buffer]);
        this.buffer = new Float32Array(CHUNK_FRAMES);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('rallybeat-capture', RallyBeatCapture);
