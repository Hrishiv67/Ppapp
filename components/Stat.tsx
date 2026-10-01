import type { ReactNode } from "react";

/** One labeled number in a row of stats, divided by hairlines. */
export function Stat({ label, value, unit, tone = "ink" }: { label: string; value: ReactNode; unit?: string; tone?: "ink" | "steady" }) {
  return (
    <div className="min-w-[96px] flex-1 border-l border-line pl-4 first:border-l-0 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1.5 flex flex-wrap items-baseline gap-x-1 ${tone === "steady" ? "text-steady" : "text-ink"}`}>
        <span className="num text-[40px]">{value}</span>
        {unit && <span className="text-[15px] font-medium text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}
