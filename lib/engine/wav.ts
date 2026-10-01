/**
 * Minimal RIFF/WAVE reader and writer. Writes 16-bit PCM mono (what the e2e
 * fake microphone expects); reads 16/24/32-bit integer and 32-bit float PCM,
 * mono or multi-channel (mixed down), which covers Audacity exports used for
 * training labels.
 */

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, FORMAT_PCM, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric scale so −1 maps to −32768 and +1 to +32767 without overflow.
    v.setInt16(44 + 2 * i, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
}

export function decodeWav(bytes: Uint8Array): DecodedWav {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: { offset: number; length: number } | null = null;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
      // The extensible header carries the real format code in its sub-format GUID.
      if (format === FORMAT_EXTENSIBLE && size >= 26) format = v.getUint16(body + 24, true);
    } else if (id === 'data') {
      data = { offset: body, length: Math.min(size, bytes.byteLength - body) };
    }
    // Chunks are word-aligned: odd sizes carry one pad byte.
    at = body + size + (size & 1);
  }
  if (!data || channels === 0) throw new Error('WAV file has no fmt or data chunk');
  const read = sampleReader(v, format, bits);
  const bytesPerSample = bits / 8;
  const frames = Math.floor(data.length / (bytesPerSample * channels));
  const samples = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(data.offset + (f * channels + c) * bytesPerSample);
    samples[f] = sum / channels;
  }
  return { samples, sampleRate };
}

function sampleReader(v: DataView, format: number, bits: number): (at: number) => number {
  if (format === FORMAT_FLOAT && bits === 32) return (at) => v.getFloat32(at, true);
  if (format === FORMAT_PCM && bits === 16) return (at) => v.getInt16(at, true) / 32768;
  if (format === FORMAT_PCM && bits === 24) {
    return (at) => {
      const raw = v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getUint8(at + 2) << 16);
      return ((raw << 8) >> 8) / 8388608;
    };
  }
  if (format === FORMAT_PCM && bits === 32) return (at) => v.getInt32(at, true) / 2147483648;
  throw new Error(`Unsupported WAV encoding: format ${format}, ${bits}-bit`);
}
