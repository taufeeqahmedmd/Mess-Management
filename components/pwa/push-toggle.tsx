"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * "Enable push notifications" toggle for a staff login (profile page). Registers
 * a Web Push subscription against the shared service worker and stores it via
 * /api/notifications/subscribe; what actually gets pushed is decided by
 * Notifications Management. Hidden when the server has no VAPID key or the
 * browser doesn't support push.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const toast = useToast();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vapidPublicKey || typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) {
          // One-time mount sync with the browser's actual subscription state.
          setSupported(true);
          setEnabled(Boolean(sub));
        }
      } catch {
        /* unsupported / blocked — leave the toggle hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  if (!supported) return null;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked by the browser.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setEnabled(true);
      toast.success("Push notifications enabled on this browser.");
    } catch {
      toast.error("Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Push notifications disabled.");
    } catch {
      toast.error("Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-sm">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">Push notifications</div>
        <div className="text-[11.5px] text-muted-2">Get event alerts on this browser (configured in Notifications Management).</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Push notifications"
        disabled={busy}
        onClick={enabled ? disable : enable}
        className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30 disabled:opacity-50 ${enabled ? "bg-sage" : "bg-line-strong"}`}
      >
        <span className={`inline-block size-[16px] rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
      </button>
    </div>
  );
}
