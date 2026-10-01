/** Minutes toward the weekly goal. Ink, not a status color: it is progress, not a verdict. */
export function WeekRing({ minutes, goal, size = 120 }: { minutes: number; goal: number; size?: number }) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, minutes / goal);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(minutes)} of ${goal} minutes this week`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="ring-fill"
        style={{ ["--ring-len" as string]: `${c}` }}
      />
    </svg>
  );
}
