"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { DayBars } from "@/components/DayBars";
import { DemoBadge } from "@/components/DemoBadge";
import { Loader } from "@/components/Loader";
import { Logo } from "@/components/Logo";
import { SessionMap } from "@/components/SessionMap";
import { WeekRing } from "@/components/WeekRing";
import { steadyLine } from "@/lib/copy";
import { dayLabel, minutes } from "@/lib/format";
import { useSessions } from "@/lib/useSessions";
import { WEEKLY_GOAL_MINUTES, weekDays, weekMinutes } from "@/lib/week";

export function Home() {
  const demo = useSearchParams().has("demo");
  const sessions = useSessions(demo);
  if (!sessions) return <main className="screen"><Loader /></main>;
  if (sessions.length === 0) return <Welcome />;

  const q = demo ? "&demo=1" : "";
  const days = weekDays(sessions);
  const total = weekMinutes(days);
  const last = sessions[0];

  return (
    <main className="screen">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-3">
        <span className="flex flex-wrap items-center gap-3">
          <Logo />
          {demo && <DemoBadge />}
        </span>
        <Link href="/about" className="flex h-12 items-center text-[17px] font-semibold text-ink-muted">About</Link>
      </header>

      <Link href={`/week${demo ? "?demo=1" : ""}`} className="mt-8 block" aria-label="Open this week">
        <div className="eyebrow">This week</div>
        <div className="mt-4 flex items-center gap-6">
          <WeekRing minutes={total} goal={WEEKLY_GOAL_MINUTES} size={116} />
          <div>
            <div className="num text-[72px]">{Math.round(total)}</div>
            <div className="mt-1 text-[18px] text-ink-muted">of {WEEKLY_GOAL_MINUTES} minutes</div>
          </div>
        </div>
      </Link>
      <div className="mt-7">
        <DayBars days={days} goal={WEEKLY_GOAL_MINUTES} height={56} />
      </div>

      <Link href={`/session?id=${last.id}${q}`} className="mt-6 block border-t border-line pt-5">
        <div className="eyebrow">Last time · {dayLabel(last.startedAt)}</div>
        <div className="mt-3">
          <SessionMap rallies={last.summary.rallies} durationSeconds={last.summary.durationSeconds} steadyWindow={last.summary.steadyWindow} markers={[]} />
        </div>
        <p className="text-[20px] leading-snug">
          {minutes(last.summary.activeSeconds)} minutes. {steadyLine(last.summary)}
        </p>
      </Link>

      <div className="min-h-8 flex-1" />
      <Button href="/play" ball>Start playing</Button>
      <p className="mt-3 text-center text-[15px] font-medium text-ink-muted">Set your phone on the table. Nothing is recorded.</p>
    </main>
  );
}

function Welcome() {
  return (
    <main className="screen">
      <header className="flex h-14 items-center"><Logo /></header>
      <svg viewBox="-2 0 346 64" className="mt-16 w-full" aria-hidden="true">
        <rect y="31" width="342" height="2" rx="1" fill="var(--ink)" opacity="0.85" />
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={10 + i * 39.5} cy="32" r={i === 8 ? 9 : 4 + i * 0.5} fill={i === 8 ? "var(--ball)" : "var(--ink)"} className="rb-dot-in" style={{ animationDelay: `${i * 90}ms`, transformOrigin: `${10 + i * 39.5}px 32px` }} />
        ))}
      </svg>
      <h1 className="mt-12 text-[44px] leading-[1.05] font-semibold">A log for your ping pong.</h1>
      <p className="mt-5 text-[20px] text-ink-muted">Put your phone by the table and play. RallyBeat counts how long you really played and how steady your rhythm stayed.</p>
      <div className="min-h-8 flex-1" />
      <Button href="/play" ball>Start playing</Button>
      <div className="mt-2"><Button variant="quiet" href="/?demo=1">See a sample week</Button></div>
    </main>
  );
}
