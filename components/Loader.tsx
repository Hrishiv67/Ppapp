/** PingPod's bouncing ball, landing on the beat-strip line. */
export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4" role="status">
      <div className="relative h-12 w-28">
        <div className="absolute inset-x-0 bottom-2 h-0.5 rounded-full bg-ink/80" />
        <div className="rb-ball absolute left-1/2 top-0 size-4 rounded-full bg-ball" />
        <div className="rb-ball-shadow absolute left-1/2 bottom-0.5 h-1.5 w-5 rounded-full bg-ink blur-[3px]" />
      </div>
      <span className="eyebrow">{label}</span>
    </div>
  );
}
