"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Chrome's beforeinstallprompt event (not in the standard lib DOM types). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // re-offer a week after dismissal

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes navigator.standalone when launched from the home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Macintosh but is touch-capable.
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/**
 * PWA install affordance. Registers the service worker site-wide (its fetch
 * handler stays counter-only — see public/sw.js — so no offline behavior is
 * added elsewhere; this only makes the app installable everywhere) and shows a
 * themed banner: Android triggers Chrome's native install dialog; iOS shows the
 * manual "Add to Home Screen" steps. Hidden once installed, on the counter POS,
 * or when recently dismissed.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  // Register the service worker for the whole origin (scope "/").
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's default mini-infobar; we show our own
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIosHint(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — offer manual instructions instead.
    // One-time client-only capability check (navigator.userAgent); it can't run
    // on the server, and doing it post-mount keeps the first client render equal
    // to the server's (both render nothing → no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIos()) setIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The counter is a full-screen POS — don't obstruct it with the banner.
  if (pathname?.startsWith("/counter")) return null;

  const visible = deferred !== null || iosHint;
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setIosHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Install Mess Management"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/images/favicon/web-app-manifest-192x192.png"
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Install Mess Management</p>
        {deferred ? (
          <p className="text-xs text-ink-2">Add it to your home screen for quick, full-screen access.</p>
        ) : (
          <p className="text-xs text-ink-2">
            Tap the Share icon, then <span className="font-medium text-ink">Add to Home Screen</span>.
          </p>
        )}
      </div>

      {deferred ? (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-pill bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep"
        >
          Install
        </button>
      ) : null}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
