"use client";
import { useState } from "react";
import type { RhythmBlock } from "@/lib/engine";
import { STEADY_MIN_SCORE } from "@/lib/engine";

/** Rhythm score for each 5 minutes. Green only where the rhythm was steady. */
export function RhythmBlocks({ blocks, height = 104 }: { blocks: RhythmBlock[]; height?: number }) {
  const scored = blocks.filter((b) => b.rhythm);
  const [picked, setPicked] = useState<number | null>(null);
  if (scored.length === 0) return null;
  const floor = 50;
  const h = (s: number) => Math.max(6, ((s - floor) / (100 - floor)) * height);

  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 54 }} role="group" aria-label="Rhythm score for each five minutes">
      {scored.map((b, i) => {
        const score = Math.round(b.rhythm!.score);
        const steady = score >= STEADY_MIN_SCORE;
        const on = picked === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setPicked(on ? null : i)}
            aria-label={`Minutes ${b.startMinute} to ${b.endMinute}: rhythm ${score}, ${b.rhythm!.label}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            <span className={`mb-1.5 text-[14px] font-semibold tabular-nums ${steady ? "text-steady" : "text-ink-muted"}`}>{score}</span>
            <span
              className={`rb-grow-y w-full max-w-12 rounded-t-[4px] transition-opacity ${steady ? "bg-steady" : "bg-ink-muted/60"} ${picked !== null && !on ? "opacity-40" : ""}`}
              style={{ height: h(score), animationDelay: `${i * 50}ms` }}
            />
            <span className="mt-2 text-[13px] font-medium text-ink-faint tabular-nums">{b.startMinute}</span>
          </button>
        );
      })}
    </div>
  );
}
