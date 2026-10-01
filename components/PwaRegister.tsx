"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /*
     * Never register the caching worker in development. sw.js serves documents
     * and CSS from its own cache, which means an edit that has already rebuilt
     * on the server keeps rendering the previous version in the browser —
     * silently, and through hard reloads and server restarts alike. Any worker
     * left over from a production visit on the same origin is torn down here for
     * the same reason.
     */
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) caches.delete(key);
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching is a progressive enhancement — never block the app on it.
    });
  }, []);
  return null;
}
