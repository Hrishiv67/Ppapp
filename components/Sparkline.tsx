"use client";
import { useState } from "react";

/** A small trend line with an end dot. Tap any point to read it. */
export function Sparkline({ values, labels, tone = "steady", unit = "" }: { values: number[]; labels: string[]; tone?: "steady" | "ink"; unit?: string }) {
  const [picked, setPicked] = useState(values.length - 1);
  if (values.length < 2) return null;
  const w = 150;
  const h = 44;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => [4 + (i / (values.length - 1)) * (w - 8), h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 12)]);
  const color = tone === "steady" ? "var(--steady)" : "var(--ink)";
  return (
    <div className="flex flex-col items-end">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={labels.map((l, i) => `${l}: ${Math.round(values[i])}${unit}`).join(", ")}>
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === picked ? 5 : 12} fill={i === picked ? color : "transparent"} onClick={() => setPicked(i)} className="cursor-pointer" />
        ))}
      </svg>
      <span className="text-[13px] font-medium text-ink-muted tabular-nums">
        {labels[picked]} · {Math.round(values[picked])}
        {unit}
      </span>
    </div>
  );
}
