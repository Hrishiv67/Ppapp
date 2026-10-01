/** Weekly totals for the ring, the day bars and the trends. Weeks start Monday. */
import type { StoredSession } from "@/lib/store/sessions";

/** Parkinson's Foundation / ACSM: 150 minutes of exercise a week. */
export const WEEKLY_GOAL_MINUTES = 150;

export interface DayTotal {
  date: Date;
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
}

export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const activeMinutes = (s: StoredSession) => s.summary.activeSeconds / 60;

export function weekDays(sessions: StoredSession[], now = new Date()): DayTotal[] {
  const start = startOfWeek(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const minutes = sessions
      .filter((s) => sameDay(new Date(s.startedAt), date))
      .reduce((sum, s) => sum + activeMinutes(s), 0);
    return { date, minutes, isToday: sameDay(date, now), isFuture: date > now && !sameDay(date, now) };
  });
}

export const weekMinutes = (days: DayTotal[]) => days.reduce((sum, d) => sum + d.minutes, 0);

export function sessionsThisWeek(sessions: StoredSession[], now = new Date()) {
  const start = startOfWeek(now).getTime();
  return sessions.filter((s) => s.startedAt >= start);
}
