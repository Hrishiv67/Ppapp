"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { LiveView } from "@/components/live/LiveView";
import { Loader } from "@/components/Loader";
import { useRally, DEMO_SECONDS } from "@/lib/audio/useRally";
import { DEMO_RESULT_KEY } from "@/lib/demo";

/**
 * Plays a synthetic rally through the real engine, out loud, so anyone
 * without a table can watch RallyBeat work. Nothing from the demo is saved.
 */
export default function DemoPage() {
  const router = useRouter();
  const rally = useRally("demo");
  const { status, start, stop: stopRally, now } = rally;
  const began = useRef(false);

  const stop = useCallback(() => {
    const summary = stopRally();
    if (summary) sessionStorage.setItem(DEMO_RESULT_KEY, JSON.stringify(summary));
    router.push("/session?id=live-demo");
  }, [stopRally, router]);

  useEffect(() => {
    if (began.current) return;
    began.current = true;
    start();
  }, [start]);

  // The recording is finite; wrap up once the last rally has had time to end.
  useEffect(() => {
    if (status !== "listening") return;
    const id = setInterval(() => {
      if (now() > DEMO_SECONDS + 2.5) stop();
    }, 500);
    return () => clearInterval(id);
  }, [status, now, stop]);

  if (status !== "listening") return <main className="screen"><Loader label="Setting up the demo" /></main>;
  return <LiveView demo stats={rally.stats} getDots={rally.getDots} now={now} lastRallyHits={rally.lastRallyHits} onStop={stop} onMute={rally.setMuted} />;
}
