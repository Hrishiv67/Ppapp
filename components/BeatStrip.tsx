"use client";
import { useEffect, useRef } from "react";

/**
 * The live beat strip. Time runs right to left; "now" sits at the playhead.
 * Each heard impact is a dot that lands big and then shrinks and fades as it
 * ages, so size reads as recency and a steady rally draws an even row.
 * Canvas, not DOM: a long rally adds dozens of dots a minute and this has to
 * stay at 60 fps on an old phone.
 */
const PX_PER_SECOND = 64;
const PLAYHEAD = 0.76;
const NEWEST_R = 9;
const OLDEST_R = 2.5;
// A dot takes this long to land, which reads as an impact rather than a blink.
const LAND_SECONDS = 0.16;

export interface StripDot {
  t: number;
}

export function BeatStrip({ getDots, now, height = 112, label }: { getDots: () => StripDot[]; now: () => number; height?: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const css = getComputedStyle(el);
    const ball = css.getPropertyValue("--ball").trim();
    const line = css.getPropertyValue("--ink").trim();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      if (el.width !== Math.round(w * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      const mid = height / 2;
      const head = w * PLAYHEAD;
      const span = head / PX_PER_SECOND;
      const t = now();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = line;
      ctx.fillRect(0, mid - 1, w, 2);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(head + 22, 18, 1.5, height - 36);

      ctx.fillStyle = ball;
      for (const d of getDots()) {
        const age = t - d.t;
        if (age < 0 || age > span) continue;
        const k = 1 - age / span;
        const eased = k * k;
        const land = reduced ? 1 : Math.min(1, age / LAND_SECONDS);
        const r = (OLDEST_R + (NEWEST_R - OLDEST_R) * eased) * (0.4 + 0.6 * land);
        ctx.globalAlpha = 0.2 + 0.8 * Math.pow(k, 1.5);
        ctx.beginPath();
        ctx.arc(head - age * PX_PER_SECOND, mid, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [height, now, getDots]);

  return <canvas ref={canvas} role="img" aria-label={label} className="block w-full" style={{ height }} />;
}
