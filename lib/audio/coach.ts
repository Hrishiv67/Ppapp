/**
 * The spoken coach. Speaks rarely: a new best rally and, once, a rest
 * suggestion when rhythm turns choppy late in a session. Silence is the
 * default so it never talks over the game.
 */
export function say(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// A best under this is too ordinary to interrupt play for.
const BEST_WORTH_SAYING = 8;
// Fatigue is not meaningful before this much of a session.
const REST_AFTER_SECONDS = 12 * 60;

export class Coach {
  private best = 0;
  private restSaid = false;
  muted = false;

  rallyEnded(hits: number) {
    if (hits > this.best) {
      this.best = hits;
      if (!this.muted && hits >= BEST_WORTH_SAYING) say(`New best. ${hits} hits.`);
    }
  }

  rhythm(label: "steady" | "mixed" | "choppy" | undefined, elapsedSeconds: number) {
    if (this.muted || this.restSaid || label !== "choppy" || elapsedSeconds < REST_AFTER_SECONDS) return;
    this.restSaid = true;
    say("Your rhythm is getting choppy. A short rest might help.");
  }
}
