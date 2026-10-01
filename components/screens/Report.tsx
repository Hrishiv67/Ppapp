"use client";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/Button";
import { DayBars } from "@/components/DayBars";
import { Loader } from "@/components/Loader";
import { Logo } from "@/components/Logo";
import { clock, minutes } from "@/lib/format";
import { steadyPlayMinutes } from "@/lib/steady";
import { useSessions } from "@/lib/useSessions";
import { WEEKLY_GOAL_MINUTES, sessionsThisWeek, weekDays, weekMinutes } from "@/lib/week";

/** One page a player can print or show a physical therapist. */
export function Report() {
  const demo = useSearchParams().has("demo");
  const all = useSessions(demo);
  if (!all) return <main className="screen"><Loader /></main>;
  const sessions = sessionsThisWeek(all);
  const days = weekDays(all);

  return (
    <main className="screen print:max-w-none print:p-10">
      <div className="no-print flex h-14 items-center"><BackLink href={demo ? "/?demo=1" : "/"} /></div>
      <header className="mt-4 border-b border-ink pb-4">
        <Logo />
        <div className="eyebrow mt-3">Activity report{demo ? " · Demo data" : ""}</div>
      </header>

      <h1 className="mt-6 text-[30px] leading-tight font-semibold">
        {Math.round(weekMinutes(days))} of {WEEKLY_GOAL_MINUTES} active minutes this week
      </h1>
      <div className="mt-6"><DayBars days={days} goal={WEEKLY_GOAL_MINUTES} height={100} full /></div>

      <ul className="mt-8 border-t border-line">
        {sessions.map((s) => {
          const w = s.summary.steadyWindow;
          const steady = w.status === "found" ? `${Math.round(steadyPlayMinutes(s.summary)!)} min` : w.status === "held" ? "whole session" : "—";
          return (
            <li key={s.id} className="border-b border-line py-3">
              <div className="text-[17px] font-semibold">
                {new Date(s.startedAt).toLocaleDateString("en-US", { weekday: "long" })}, {clock(s.startedAt)}
              </div>
              <dl className="mt-1 grid grid-cols-4 gap-2 text-[16px] tabular-nums">
                {[
                  ["Active", `${minutes(s.summary.activeSeconds)} min`],
                  ["Longest", `${s.summary.longestRally} hits`],
                  ["Rhythm", s.summary.rhythm ? `${Math.round(s.summary.rhythm.score)}` : "—"],
                  ["Steady", steady],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-[14px] text-ink-muted">
        RallyBeat is an exercise log, not a medical device. Active minutes count time spent in rallies, measured from the sound of the
        ball. Rhythm is how even the time between hits was (100 is perfectly even). It does not diagnose or measure any condition.
      </p>
      <div className="no-print mt-auto pt-8"><Button onClick={() => window.print()}>Print or save as PDF</Button></div>
    </main>
  );
}
