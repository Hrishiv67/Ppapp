"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LiveView } from "@/components/live/LiveView";
import { Loader } from "@/components/Loader";
import { StateScreen } from "@/components/StateScreen";
import { useRally } from "@/lib/audio/useRally";
import { newSessionId, saveSession } from "@/lib/store/sessions";

export default function PlayPage() {
  const router = useRouter();
  const rally = useRally("mic");

  const stop = async () => {
    const summary = rally.stop();
    if (!summary) return router.push("/");
    const id = newSessionId();
    await saveSession({ id, startedAt: Date.now() - summary.durationSeconds * 1000, summary });
    router.push(`/session?id=${id}`);
  };

  if (rally.status === "listening")
    return (
      <LiveView
        stats={rally.stats}
        getDots={rally.getDots}
        now={rally.now}
        lastRallyHits={rally.lastRallyHits}
        onStop={stop}
        onMeds={() => rally.mark("meds")}
        onMute={rally.setMuted}
      />
    );

  if (rally.status === "starting") return <main className="screen"><Loader label="Getting ready" /></main>;

  if (rally.status === "denied")
    return (
      <StateScreen
        icon="micOff"
        title="We can’t hear the ball yet."
        actions={
          <>
            <Button onClick={rally.start}>Try again</Button>
            <Button variant="quiet" href="/demo">Watch the demo instead</Button>
          </>
        }
      >
        <p>The microphone is off for RallyBeat.</p>
        <dl className="mt-6 space-y-4 text-[18px] text-ink">
          <div className="border-t border-line pt-4">
            <dt className="eyebrow">iPhone</dt>
            <dd className="mt-1">Settings, then Safari, then Microphone. Choose Allow.</dd>
          </div>
          <div className="border-t border-line pt-4">
            <dt className="eyebrow">Android</dt>
            <dd className="mt-1">Tap the lock by the web address, then Permissions. Turn on Microphone.</dd>
          </div>
        </dl>
      </StateScreen>
    );

  if (rally.status === "unsupported" || rally.status === "error")
    return (
      <StateScreen
        icon="micOff"
        title={rally.status === "unsupported" ? "This browser can’t listen." : "Something stopped the microphone."}
        actions={
          <>
            <Button onClick={rally.start}>Try again</Button>
            <Button variant="quiet" href="/demo">Watch the demo instead</Button>
          </>
        }
      >
        <p>{rally.status === "unsupported" ? "Open RallyBeat in Safari on iPhone or Chrome on Android." : "Close other apps using the microphone, then try again."}</p>
      </StateScreen>
    );

  return (
    <StateScreen
      icon="mic"
      title="RallyBeat listens for the ball."
      actions={
        <>
          <Button ball onClick={rally.start}>Start listening</Button>
          <Button variant="quiet" href="/demo">See a demo first</Button>
        </>
      }
    >
      <ul className="space-y-3 text-[18px] text-ink">
        {["Nothing is recorded.", "Nothing leaves your phone.", "Set it on the table, screen up."].map((line) => (
          <li key={line} className="flex items-center gap-3">
            <Icon name="check" className="text-steady" />
            {line}
          </li>
        ))}
      </ul>
    </StateScreen>
  );
}
