"use client";

import { useEffect, useState } from "react";

/**
 * First-paint splash. Rendered in the root layout so it's part of the initial
 * server HTML and covers the screen from the very first paint, then fades out
 * once the page has finished loading (with a short minimum so it reads as an
 * intentional brand moment, not a flash). It mounts once per full page load;
 * client-side navigations don't retrigger it (the layout instance persists with
 * the splash already dismissed). Motion is neutralized under
 * prefers-reduced-motion by the global rule in globals.css.
 */
export function Preloader() {
  const [hiding, setHiding] = useState(false);
  const [gone, setGone] = useState(false);

  // Begin the fade once the document is fully loaded, but never before a short
  // minimum so a fast load doesn't flash the splash.
  useEffect(() => {
    const MIN_MS = 5000;
    const startHide = () => setHiding(true);
    const timer = window.setTimeout(() => {
      if (document.readyState === "complete") startHide();
      else window.addEventListener("load", startHide, { once: true });
    }, MIN_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", startHide);
    };
  }, []);

  // Unmount after the fade transition completes.
  useEffect(() => {
    if (!hiding) return;
    const t = window.setTimeout(() => setGone(true), 520);
    return () => window.clearTimeout(t);
  }, [hiding]);

  if (gone) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Mess Management"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-canvas transition-opacity duration-500 ${
        hiding ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF; next/image would freeze it */}
        <img
          src="/assets/images/Brewing-Coffee.gif"
          alt=""
          width={160}
          height={160}
          className="block size-40 object-contain"
        />

        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Mess Management
          </h1>
          <p className="text-sm text-ink-2">Brewing your session…</p>
        </div>

        <div className="preloader-track" aria-hidden="true">
          <span className="preloader-bar" />
        </div>
      </div>
    </div>
  );
}
