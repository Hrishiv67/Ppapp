"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { DemoBadge } from "@/components/DemoBadge";
import { Icon } from "@/components/Icon";
import { Loader } from "@/components/Loader";
import { RhythmBlocks } from "@/components/RhythmBlocks";
import { SessionMap } from "@/components/SessionMap";
import { Stat } from "@/components/Stat";
import { say } from "@/lib/audio/coach";
import { spokenSummary, steadyLine, steadyTail } from "@/lib/copy";
import { steadyPlayMinutes } from "@/lib/steady";
import { clock, dayLabel, minutes } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export function Summary() {
  const params = useSearchParams();
  const session = useSession(params.get("id"));
  if (session === undefined) return <main className="screen"><Loader /></main>;
  if (session === null)
    return (
      <main className="screen">
        <BackLink />
        <h1 className="mt-10 text-[30px] font-semibold">We couldn’t find that session.</h1>
      </main>
    );

  const s = session.summary;
  const home = params.has("demo") ? "/?demo=1" : "/";
  const end = session.startedAt + s.durationSeconds * 1000;
  const w = s.steadyWindow;
  const steadyMinutes = steadyPlayMinutes(s);

  return (
    <main className="screen">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2">
        <BackLink href={home} />
        <button
          type="button"
          onClick={() => say(spokenSummary(s))}
          className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border-[1.5px] border-line px-4 text-[17px] font-semibold"
        >
          <Icon name="speaker" />
          Read aloud
        </button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="eyebrow">
          {session.id === "live-demo" ? "Just now" : `${dayLabel(session.startedAt)} · ${clock(session.startedAt)}–${clock(end)}`}
        </span>
        {session.demo && <DemoBadge />}
      </div>
      <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold">You played {minutes(s.activeSeconds)} minutes.</h1>

      <div className="mt-6">
        <SessionMap rallies={s.rallies} durationSeconds={s.durationSeconds} steadyWindow={w} markers={s.markers} />
      </div>

      <div className="mt-4 flex flex-wrap gap-y-4">
        <Stat label="Active" value={minutes(s.activeSeconds)} unit="min" />
        <Stat label="Longest" value={s.longestRally} unit="hits" />
        <Stat label="Rhythm" value={s.rhythm ? Math.round(s.rhythm.score) : "—"} unit={s.rhythm?.label} tone={s.rhythm?.label === "steady" ? "steady" : "ink"} />
      </div>

      <section className="mt-7 bg-surface p-5">
        <div className="eyebrow">Steady window</div>
        {steadyMinutes !== null ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-steady">
            <span className="num text-[64px]">{Math.round(steadyMinutes)}</span>
            <span className="text-[22px] font-semibold">minutes</span>
            <span className="text-[19px] font-medium text-ink-muted">{steadyTail(s)}</span>
          </div>
        ) : (
          <p className="mt-2 text-[19px]">{steadyLine(s)}</p>
        )}
        <div className="mt-5">
          <RhythmBlocks blocks={s.rhythmBlocks} />
          <p className="mt-1 text-right text-[13px] font-medium text-ink-faint">minute of session</p>
        </div>
      </section>

      {session.id !== "live-demo" ? (
        <Link href={`/report${params.has("demo") ? "?demo=1" : ""}`} className="mt-6 flex h-12 items-center gap-2 text-[17px] font-semibold">
          Report for my therapist
          <Icon name="next" />
        </Link>
      ) : null}
    </main>
  );
}
