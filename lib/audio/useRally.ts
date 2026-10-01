"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RallySession, synthesizeSession, type LiveStats, type SessionSummary } from "@/lib/engine";
import { Coach } from "./coach";

export type RallyStatus = "idle" | "starting" | "listening" | "denied" | "unsupported" | "error";
export type RallySource = "mic" | "demo";

// The demo plays this much synthetic rally audio through the real engine.
export const DEMO_SECONDS = 75;

const EMPTY_STATS: LiveStats = {
  elapsedSeconds: 0,
  activeSeconds: 0,
  rallyCount: 0,
  longestRally: 0,
  inRally: false,
  currentRallyImpacts: 0,
  rhythm: null,
};

/**
 * One live session: audio in, RallySession out. The same path serves the
 * microphone and the demo, so the demo proves the real pipeline.
 */
export function useRally(source: RallySource) {
  const [status, setStatus] = useState<RallyStatus>("idle");
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [lastRallyHits, setLastRallyHits] = useState<number | null>(null);
  const dots = useRef<{ t: number }[]>([]);
  const session = useRef<RallySession | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const startedAt = useRef(0);
  const coach = useRef(new Coach());
  // The strip reads dots every frame; handing it the array via a getter keeps
  // impacts out of React state, where 60 updates a minute would re-render the page.
  const getDots = useCallback(() => dots.current, []);

  const now = useCallback(() => {
    const c = ctx.current;
    return c ? c.currentTime - startedAt.current : 0;
  }, []);

  const teardown = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    wakeLock.current?.release();
    wakeLock.current = null;
    ctx.current?.close();
    ctx.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (!("AudioWorkletNode" in window) || (source === "mic" && !navigator.mediaDevices?.getUserMedia)) {
      setStatus("unsupported");
      return;
    }
    setStatus("starting");
    let input: MediaStream | null = null;
    if (source === "mic") {
      try {
        // Phones "clean up" voice calls by gating short clicks as noise;
        // those clicks are exactly what we need.
        input = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        setStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "error");
        return;
      }
    }
    const ac = new AudioContext();
    ctx.current = ac;
    stream.current = input;
    await ac.audioWorklet.addModule("/worklets/capture.js");
    const node = new AudioWorkletNode(ac, "rallybeat-capture");
    // The worklet must be pulled by the graph to run; a muted gain keeps it
    // connected without playing the mic back out of the speaker.
    const sink = ac.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ac.destination);

    const rs = new RallySession({
      sampleRate: ac.sampleRate,
      onEvent: (e) => {
        if (e.type === "impact") dots.current.push({ t: e.t });
        if (e.type === "rallyEnd" && e.rally) {
          setLastRallyHits(e.rally.hits);
          coach.current.rallyEnded(e.rally.hits);
        }
      },
    });
    session.current = rs;
    node.port.onmessage = (m: MessageEvent<{ samples: Float32Array }>) => {
      rs.push(m.data.samples);
      const s = rs.stats;
      setStats(s);
      coach.current.rhythm(s.rhythm?.label, s.elapsedSeconds);
    };

    if (input) {
      ac.createMediaStreamSource(input).connect(node);
    } else {
      // Rendering ~a minute of audio takes a moment; it is the same synthesizer the tests use.
      const synth = synthesizeSession({ seed: 7, durationSec: DEMO_SECONDS, sampleRate: ac.sampleRate, hitsPerRally: [5, 18], restSec: [4, 7] });
      const buffer = ac.createBuffer(1, synth.samples.length, ac.sampleRate);
      buffer.copyToChannel(new Float32Array(synth.samples), 0);
      const player = ac.createBufferSource();
      player.buffer = buffer;
      player.connect(node);
      player.connect(ac.destination);
      player.start();
    }
    startedAt.current = ac.currentTime;
    await ac.resume();
    wakeLock.current = await navigator.wakeLock?.request("screen").catch(() => null) ?? null;
    setStatus("listening");
  }, [source]);

  const mark = useCallback((label: string) => session.current?.mark(label), []);

  const stop = useCallback((): SessionSummary | null => {
    const summary = session.current?.finish() ?? null;
    session.current = null;
    teardown();
    setStatus("idle");
    return summary;
  }, [teardown]);

  const setMuted = useCallback((m: boolean) => {
    coach.current.muted = m;
    if (m) window.speechSynthesis?.cancel();
  }, []);

  return { status, stats, lastRallyHits, getDots, now, start, stop, mark, setMuted };
}
