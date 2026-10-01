"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { DayBars } from "@/components/DayBars";
import { DemoBadge } from "@/components/DemoBadge";
import { Icon } from "@/components/Icon";
import { Loader } from "@/components/Loader";
import { Sparkline } from "@/components/Sparkline";
import { dayShort, minutes } from "@/lib/format";
import type { StoredSession } from "@/lib/store/sessions";
import { useSessions } from "@/lib/useSessions";
import { steadyPlayMinutes } from "@/lib/steady";
import { WEEKLY_GOAL_MINUTES, sessionsThisWeek, startOfWeek, weekDays, weekMinutes } from "@/lib/week";

const steadyMinutes = (s: StoredSession) => steadyPlayMinutes(s.summary);

export function Week() {
  const demo = useSearchParams().has("demo");
  const sessions = useSessions(demo);
  if (!sessions) return <main className="screen"><Loader /></main>;

  const days = weekDays(sessions);
  const total = Math.round(weekMinutes(days));
  const left = Math.max(0, WEEKLY_GOAL_MINUTES - total);
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const chrono = [...sessions].reverse();
  const steady = chrono.filter((s) => steadyMinutes(s) !== null);
  const scored = chrono.filter((s) => s.summary.rhythm);
  const q = demo ? "&demo=1" : "";

  return (
    <main className="screen">
      <div className="flex h-14 items-center justify-between">
        <BackLink href={demo ? "/?demo=1" : "/"} />
        {demo && <DemoBadge />}
      </div>
      <div className="eyebrow mt-6">{fmt(start)} – {fmt(end)}</div>
      <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold">
        {total} of {WEEKLY_GOAL_MINUTES} minutes
      </h1>
      <p className="mt-2 text-[19px] text-ink-muted">{left === 0 ? "You reached your goal." : `${left} to go.`}</p>

      <div className="mt-8">
        <DayBars days={days} goal={WEEKLY_GOAL_MINUTES} height={140} full />
      </div>

      {steady.length >= 2 && (
        <section className="mt-8 flex items-end justify-between border-t border-line pt-6">
          <div>
            <div className="eyebrow">Steady window</div>
            <div className="mt-2 flex items-baseline gap-1.5 text-steady">
              <span className="num text-[48px]">{Math.round(steadyMinutes(steady[steady.length - 1])!)}</span>
              <span className="text-[17px] font-semibold">min</span>
            </div>
          </div>
          <Sparkline values={steady.map((s) => steadyMinutes(s)!)} labels={steady.map((s) => dayShort(new Date(s.startedAt)))} unit=" min" />
        </section>
      )}

      {scored.length >= 2 && (
        <section className="mt-6 flex items-end justify-between border-t border-line pt-6">
          <div>
            <div className="eyebrow">Rhythm</div>
            <div className="num mt-2 text-[48px] text-steady">{Math.round(scored[scored.length - 1].summary.rhythm!.score)}</div>
          </div>
          <Sparkline values={scored.map((s) => s.summary.rhythm!.score)} labels={scored.map((s) => dayShort(new Date(s.startedAt)))} />
        </section>
      )}

      <section className="mt-8 border-t border-line pt-5">
        <div className="eyebrow">Sessions</div>
        <ul className="mt-2">
          {sessionsThisWeek(sessions).map((s) => (
            <li key={s.id}>
              <Link href={`/session?id=${s.id}${q}`} className="flex h-16 items-center border-b border-line text-[18px]">
                <span className="w-16 font-semibold">{dayShort(new Date(s.startedAt))}</span>
                <span className="w-24 tabular-nums">{minutes(s.summary.activeSeconds)} min</span>
                <span className="flex-1 text-ink-muted tabular-nums">{s.summary.longestRally} hits</span>
                <span className="w-10 font-semibold text-steady tabular-nums">{s.summary.rhythm ? Math.round(s.summary.rhythm.score) : "—"}</span>
                <Icon name="next" className="text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
