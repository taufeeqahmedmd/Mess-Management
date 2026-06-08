"use client";

import { useEffect } from "react";

/**
 * Registers the counter offline service worker. Counter-only (frontend rules):
 * mounted on /counter, not app-wide. Production-only — a SW in `next dev`
 * fights HMR. Silent on failure; offline tap-queueing works regardless (the
 * page is already loaded), the SW only adds cold offline-load of the shell.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
