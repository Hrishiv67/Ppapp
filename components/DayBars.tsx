"use client";
import { useState } from "react";
import type { DayTotal } from "@/lib/week";
import { dayLetter, dayShort } from "@/lib/format";

/**
 * Minutes per day. Every bar is a button: tap one to read its exact value
 * (and hear it with a screen reader). The dashed line is the daily pace that
 * reaches the weekly goal.
 */
export function DayBars({ days, goal, height = 120, full = false }: { days: DayTotal[]; goal: number; height?: number; full?: boolean }) {
  const today = days.findIndex((d) => d.isToday);
  const [picked, setPicked] = useState<number>(today >= 0 ? today : 0);
  const pace = goal / 7;
  const max = Math.max(pace * 1.4, ...days.map((d) => d.minutes));
  const y = (m: number) => (m / max) * height;

  return (
    <figure className="m-0">
      <div className="relative" style={{ height: height + 28 }}>
        <div
          className="absolute inset-x-0 border-t border-dashed border-ink-faint"
          style={{ bottom: 28 + y(pace) }}
          aria-hidden="true"
        />
        {full && (
          <span className="absolute right-0 text-[13px] font-medium text-ink-faint" style={{ bottom: 28 + y(pace) - 20 }}>
            daily pace
          </span>
        )}
        <div className="absolute inset-0 flex items-end justify-between">
          {days.map((d, i) => {
            const m = Math.round(d.minutes);
            const on = i === picked;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(i)}
                aria-label={`${dayShort(d.date)}: ${m} minutes`}
                aria-pressed={on}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className={`relative z-10 mb-1.5 bg-bg px-1 text-[14px] font-semibold tabular-nums transition-opacity ${on ? "text-ink opacity-100" : "text-ink-muted opacity-0"}`}>
                  {m > 0 ? m : ""}
                </span>
                <span
                  className={`rb-grow-y w-full max-w-7 rounded-t-[4px] ${m > 0 ? (on ? "bg-ink" : "bg-ink-muted/75") : "bg-line"}`}
                  style={{ height: m > 0 ? Math.max(6, y(m)) : 2, animationDelay: `${i * 40}ms` }}
                />
                <span className={`mt-2 h-5 text-[14px] ${d.isToday ? "font-bold text-ink" : "font-medium text-ink-muted"}`}>
                  {full ? dayShort(d.date) : dayLetter(d.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
