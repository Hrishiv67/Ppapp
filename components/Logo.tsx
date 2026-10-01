/** Three hits on a line, the last one the ball. The beat strip in miniature. */
export function Logo({ withWord = true }: { withWord?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
        <rect y="6" width="30" height="2" rx="1" fill="var(--ink)" />
        <circle cx="6.5" cy="7" r="3.5" fill="var(--ink)" />
        <circle cx="15.5" cy="7" r="3.5" fill="var(--ink)" />
        <circle cx="24.5" cy="7" r="3.5" fill="var(--ball)" />
      </svg>
      {withWord && <span className="text-[22px] font-semibold tracking-[-0.02em]">RallyBeat</span>}
    </span>
  );
}
