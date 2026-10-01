"use client";
import { useEffect, useState } from "react";
import { demoSessions } from "@/lib/demo";
import { listSessions, type StoredSession } from "@/lib/store/sessions";

// Private browsing can block IndexedDB; an empty history is the honest fallback.
const load = (demo: boolean): Promise<StoredSession[]> =>
  demo ? Promise.resolve(demoSessions()) : listSessions().catch(() => []);

/** The player's sessions, newest first, or the sample week. `null` while loading. */
export function useSessions(demo: boolean): StoredSession[] | null {
  const [loaded, setLoaded] = useState<{ demo: boolean; sessions: StoredSession[] } | null>(null);
  useEffect(() => {
    let live = true;
    load(demo).then((sessions) => live && setLoaded({ demo, sessions }));
    return () => {
      live = false;
    };
  }, [demo]);
  return loaded && loaded.demo === demo ? loaded.sessions : null;
}
