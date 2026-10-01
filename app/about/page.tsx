import { BackLink } from "@/components/BackLink";
import { Logo } from "@/components/Logo";

export const metadata = { title: "About · RallyBeat" };

const SOURCES = [
  ["Exercise for Parkinson’s: 150 minutes a week", "Parkinson’s Foundation and American College of Sports Medicine"],
  ["Table tennis and balance in older adults", "Meta-analysis of 14 randomized trials, 1,565 people"],
  ["Steadiness of timing and falls", "Hausdorff et al., Archives of Physical Medicine and Rehabilitation, 2001"],
];

export default function About() {
  return (
    <main className="screen">
      <div className="flex h-14 items-center"><BackLink /></div>
      <div className="mt-8"><Logo /></div>
      <h1 className="mt-8 text-[32px] leading-[1.15] font-semibold">A pedometer for ping pong.</h1>
      <p className="mt-4 text-[19px]">
        Ping pong trains balance and reaction time, and many people with Parkinson’s play every week. RallyBeat listens for the ball and tells you how much you
        really played and how steady your rhythm stayed.
      </p>

      <h2 className="eyebrow mt-10">Your privacy</h2>
      <p className="mt-2 text-[19px]">Sound is checked on your phone as you play and thrown away right after. Nothing is recorded, saved or sent. There is no account.</p>

      <h2 className="eyebrow mt-10">What it is not</h2>
      <p className="mt-2 text-[19px]">RallyBeat is an exercise log. It does not diagnose, treat or prevent anything. Play with someone nearby and stop if you feel unsteady.</p>

      <h2 className="eyebrow mt-10">Where the numbers come from</h2>
      <ul className="mt-2">
        {SOURCES.map(([what, who]) => (
          <li key={what} className="border-b border-line py-3">
            <div className="text-[18px] font-semibold">{what}</div>
            <div className="text-[16px] text-ink-muted">{who}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
