export const minutes = (seconds: number) => Math.round(seconds / 60);

export const dayShort = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short" });
export const dayLetter = (d: Date) => d.toLocaleDateString("en-US", { weekday: "narrow" });

export function dayLabel(epoch: number, now = new Date()): string {
  const d = new Date(epoch);
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

export const clock = (epoch: number) =>
  new Date(epoch).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

/** Live elapsed time: m:ss under an hour. */
export function elapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
