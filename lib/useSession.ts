"use client";
import { useEffect, useState } from "react";
import { DEMO_RESULT_KEY, demoSessions } from "@/lib/demo";
import { getSession, type StoredSession } from "@/lib/store/sessions";

async function load(id: string | null): Promise<StoredSession | null> {
  if (!id) return null;
  if (id === "live-demo") {
    const raw = sessionStorage.getItem(DEMO_RESULT_KEY);
    return raw ? { id, startedAt: Date.now(), summary: JSON.parse(raw), demo: true } : null;
  }
  if (id.startsWith("demo-")) return demoSessions().find((s) => s.id === id) ?? null;
  return (await getSession(id).catch(() => undefined)) ?? null;
}

/** One session: saved, from the sample week, or the live demo just played. `undefined` while loading. */
export function useSession(id: string | null): StoredSession | null | undefined {
  const [loaded, setLoaded] = useState<{ id: string | null; session: StoredSession | null } | null>(null);
  useEffect(() => {
    let live = true;
    load(id).then((session) => live && setLoaded({ id, session }));
    return () => {
      live = false;
    };
  }, [id]);
  return loaded && loaded.id === id ? loaded.session : undefined;
}
