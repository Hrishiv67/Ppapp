"use client";
import { useState } from "react";
import type { LiveStats } from "@/lib/engine";
import { elapsed } from "@/lib/format";
import { BeatStrip, type StripDot } from "../BeatStrip";
import { DemoBadge } from "../DemoBadge";
import { Icon } from "../Icon";

interface Props {
  stats: LiveStats;
  getDots: () => StripDot[];
  now: () => number;
  lastRallyHits: number | null;
  onStop: () => void;
  onMeds?: () => void;
  onMute: (muted: boolean) => void;
  demo?: boolean;
}

/** The court: what sits on the table while you play, readable from a few feet away. */
export function LiveView({ stats, getDots, now, lastRallyHits, onStop, onMeds, onMute, demo }: Props) {
  const [muted, setMuted] = useState(false);
  const [medsAt, setMedsAt] = useState<number | null>(null);

  // Paddle hits are about half the impacts (each hit has its bounce).
  const current = Math.ceil(stats.currentRallyImpacts / 2);
  const showing = stats.inRally ? current : (lastRallyHits ?? 0);
  const rhythm = stats.rhythm?.label;

  return (
    <main className="court court-bg min-h-dvh text-ink">
      <div className="screen">
        <div className="flex h-12 items-center justify-between">
          <span className="flex items-center gap-3 text-[17px] font-semibold text-ink-muted">
            <span className="relative flex size-3.5">
              <span className="rb-halo absolute inset-0 rounded-full bg-ball" />
              <span className="relative size-3.5 rounded-full bg-ball" />
            </span>
            Listening
            {demo && <DemoBadge />}
          </span>
          <span className="num text-[22px] text-ink-muted">{elapsed(stats.elapsedSeconds)}</span>
        </div>

        <div className="mt-14">
          <div className="eyebrow">{stats.inRally ? "Rally" : lastRallyHits ? "Last rally" : "Waiting for a rally"}</div>
          <div key={stats.rallyCount} className="num rb-pop mt-1 text-[168px] leading-[0.9]" aria-live="polite">
            {showing}
          </div>
          <div className="text-[20px] text-ink-muted">hits</div>
        </div>

        <div className="-mx-6 mt-8">
          <BeatStrip getDots={getDots} now={now} label="Each dot is a hit. Newer hits are larger." />
        </div>

        <div className="mt-6 flex flex-wrap gap-y-4">
          <div className="flex-1">
            <div className="eyebrow">Active</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums">{elapsed(stats.activeSeconds)}</div>
          </div>
          <div className="flex-1 border-l border-line pl-4">
            <div className="eyebrow">Best</div>
            <div className="mt-1 text-[24px] font-semibold">{stats.longestRally} hits</div>
          </div>
          <div className="flex-1 border-l border-line pl-4">
            <div className="eyebrow">Rhythm</div>
            <div className={`mt-1 text-[24px] font-semibold capitalize ${rhythm === "steady" ? "text-steady" : ""}`}>{rhythm ?? "—"}</div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex gap-3">
          {onMeds && (
            <button
              type="button"
              onClick={() => {
                onMeds();
                setMedsAt(stats.elapsedSeconds);
              }}
              className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-[var(--radius-control)] border-[1.5px] border-line text-[17px] font-semibold"
            >
              <Icon name="pill" />
              {medsAt === null ? "Took my medicine" : `Noted at ${elapsed(medsAt)}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              onMute(!muted);
            }}
            aria-pressed={!muted}
            aria-label={muted ? "Turn spoken coach on" : "Turn spoken coach off"}
            className={`flex h-14 w-14 items-center justify-center rounded-[var(--radius-control)] border-[1.5px] border-line ${muted ? "text-ink-faint" : ""}`}
          >
            <Icon name="speaker" />
          </button>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="mt-3 flex h-[76px] w-full items-center justify-center gap-3.5 rounded-[var(--radius-control)] bg-inverse-bg text-[22px] font-semibold text-inverse-ink active:scale-[0.985]"
        >
          <span className="size-4 rounded-[3px] bg-inverse-ink" aria-hidden="true" />
          Stop
        </button>
      </div>
    </main>
  );
}
