import { describe, expect, it } from 'vitest';
import { Rng } from '@/lib/engine/prng';
import { decodeWav, encodeWav } from '@/lib/engine/wav';

function header(format: number, channels: number, rate: number, bits: number, dataBytes: number): DataView {
  const v = new DataView(new ArrayBuffer(44 + dataBytes));
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, format, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, (rate * channels * bits) / 8, true);
  v.setUint16(32, (channels * bits) / 8, true);
  v.setUint16(34, bits, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  return v;
}

describe('wav', () => {
  it('round-trips 16-bit PCM within quantization error', () => {
    const rng = new Rng(9);
    const x = Float32Array.from({ length: 4800 }, () => rng.uniform(-1, 1));
    const { samples, sampleRate } = decodeWav(encodeWav(x, 48000));
    expect(sampleRate).toBe(48000);
    expect(samples.length).toBe(x.length);
    // Half a step of rounding plus the 32767-vs-32768 scale on positive values.
    for (let i = 0; i < x.length; i++) expect(Math.abs(samples[i] - x[i])).toBeLessThanOrEqual(2 / 32768);
  });

  it('clips out-of-range input instead of wrapping', () => {
    const { samples } = decodeWav(encodeWav(Float32Array.from([2, -2]), 16000));
    expect(samples[0]).toBeCloseTo(1, 4);
    expect(samples[1]).toBe(-1);
  });

  it('reads 32-bit float stereo and mixes it to mono', () => {
    const v = header(3, 2, 44100, 32, 16);
    v.setFloat32(44, 0.5, true);
    v.setFloat32(48, -0.25, true);
    v.setFloat32(52, 1, true);
    v.setFloat32(56, 0, true);
    const { samples, sampleRate } = decodeWav(new Uint8Array(v.buffer));
    expect(sampleRate).toBe(44100);
    expect(Array.from(samples)).toEqual([0.125, 0.5]);
  });

  it('reads 24-bit PCM including negative values', () => {
    const v = header(1, 1, 8000, 24, 6);
    // −0.5 and +0.25 in 24-bit two's complement, little-endian.
    const write24 = (at: number, value: number) => {
      const raw = value & 0xffffff;
      v.setUint8(at, raw & 0xff);
      v.setUint8(at + 1, (raw >> 8) & 0xff);
      v.setUint8(at + 2, (raw >> 16) & 0xff);
    };
    write24(44, -4194304);
    write24(47, 2097152);
    expect(Array.from(decodeWav(new Uint8Array(v.buffer)).samples)).toEqual([-0.5, 0.25]);
  });

  it('rejects files that are not WAV', () => {
    expect(() => decodeWav(new TextEncoder().encode('definitely not a wav file'))).toThrow();
  });
});
