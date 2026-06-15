"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Logo } from "@/components/shell/icons";
import { ThemeToggleButton } from "@/components/shell/theme-control";
import { useDismiss } from "@/components/shell/hooks";
import {
  enqueueTap,
  getQueuedTaps,
  removeTaps,
  queueCount,
  type QueuedTap,
} from "@/lib/offline-queue";

type Counter = { id: string; name: string; code: string };

function CardReaderGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 18h18M8 22h8" />
    </svg>
  );
}

/** Pill counter selector matching the mockup (gold dot + caret + tick menu). */
function CounterDropdown({ counters, value, onChange }: { counters: Counter[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const selected = counters.find((c) => c.id === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-pill border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-gold focus:outline-none focus-visible:border-gold focus-visible:ring-3 focus-visible:ring-gold/15"
      >
        <span className="size-[7px] rounded-full bg-gold" />
        {selected?.name ?? "Select counter"}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div role="listbox" className="absolute left-0 top-[calc(100%+8px)] z-20 min-w-[240px] rounded-md border border-line bg-surface p-1.5 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-2">Counter</p>
          {counters.map((c) => {
            const sel = c.id === value;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => { onChange(c.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13.5px] transition-colors ${sel ? "bg-gold-soft-2 font-semibold text-gold-deep" : "text-ink-2 hover:bg-gold-soft hover:text-gold-deep"}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={`size-[15px] text-gold-deep ${sel ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
                  <path d="m5 12 5 5L20 7" />
                </svg>
                <span className="flex-1">{c.name}</span>
                <span className="font-mono text-[11px] text-muted-2">{c.code}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type TapResult = {
  // ERROR = a transport/server failure, NOT a business decision — kept distinct
  // from REJECTED so a 500/403/timeout never looks like a real card decline.
  status: "APPROVED" | "REJECTED" | "BLOCKED" | "QUEUED" | "ERROR";
  reason: string;
  paidBy?: "wallet" | "coupon";
  charged?: string;
  meal?: { id: string; name: string };
  cardholder?: {
    id: string;
    name: string;
    code: string;
    category: string;
    photoUrl: string | null;
    status: string;
    walletBalance: string;
  };
  redemptionId?: string;
};

type RecentTap = { key: string; name: string; status: TapResult["status"]; meal?: string; charged?: string; paidBy?: "wallet" | "coupon"; at: string };
type SyncResult = { clientTxId: string; status: string; reason: string; name?: string; charged?: string; paidBy?: "wallet" | "coupon"; meal?: string };

const STATUS_STYLE: Record<TapResult["status"], { panel: string; chip: string; title: string; ring: string }> = {
  APPROVED: {
    panel: "border-sage-soft-2 bg-[linear-gradient(160deg,var(--sage-soft)_0%,var(--surface)_70%)]",
    chip: "bg-sage-deep text-white",
    title: "text-sage-deep",
    ring: "bg-sage-soft-2 text-sage-deep",
  },
  REJECTED: {
    panel: "border-tomato/30 bg-[linear-gradient(160deg,var(--tomato-soft)_0%,var(--surface)_70%)]",
    chip: "bg-tomato text-white",
    title: "text-tomato",
    ring: "bg-tomato-soft text-tomato",
  },
  BLOCKED: {
    panel: "border-tomato/30 bg-[linear-gradient(160deg,var(--tomato-soft)_0%,var(--surface)_70%)]",
    chip: "bg-tomato text-white",
    title: "text-tomato",
    ring: "bg-tomato-soft text-tomato",
  },
  QUEUED: {
    panel: "border-gold-soft-2 bg-[linear-gradient(160deg,var(--gold-soft)_0%,var(--surface)_70%)]",
    chip: "bg-gold-deep text-white",
    title: "text-gold-deep",
    ring: "bg-gold-soft-2 text-gold-deep",
  },
  // Neutral, not red — this is a system error to retry, not a card decline.
  ERROR: { panel: "border-line-strong bg-surface-2", chip: "bg-ink-2 text-white", title: "text-ink", ring: "bg-surface-2 text-muted" },
};

function dotFor(status: TapResult["status"]) {
  if (status === "APPROVED") return "bg-sage";
  if (status === "QUEUED") return "bg-gold-deep";
  if (status === "ERROR") return "bg-ink-2";
  return "bg-tomato";
}

// Online status as an external store: SSR + first client render use the stable
// server snapshot (true), then it tracks navigator.onLine. Avoids the Node-23
// `navigator` hydration mismatch and a setState-in-effect.
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function CounterScreen({
  counters,
  operatorName,
  counterOnly,
}: {
  counters: Counter[];
  operatorName: string;
  counterOnly: boolean;
}) {
  const [counterId, setCounterId] = useState(counters[0]?.id ?? "");
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<TapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentTap[]>([]);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{ approved: number; rejected: number; blocked: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  // Inter-key timing to tell a reader burst (keys ms apart) from manual typing,
  // and to auto-submit for readers that don't emit a trailing Enter.
  const lastKeyAtRef = useRef(0);
  const burstRef = useRef(true);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void queueCount().then(setQueued);
    void syncQueue();

    // Keep the scan input focused, but don't steal focus from a control the
    // operator is actually using (counter select, sync/exit buttons, links).
    const refocus = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, select, a, input, [role='button']")) return;
      inputRef.current?.focus();
    };
    // Re-grab focus whenever the window/tab regains it, so the reader is always live.
    const onFocus = () => inputRef.current?.focus();
    const reSync = () => void syncQueue(); // flush the offline queue on reconnect
    window.addEventListener("click", refocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", reSync);
    return () => {
      window.removeEventListener("click", refocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", reSync);
    };
  }, []);

  // A tap result stays on screen for 10s, then the panel returns to "Tap a card"
  // and re-arms the reader. A new tap mid-window replaces the result immediately:
  // setResult re-runs this effect, the cleanup clears the old timer, and a fresh
  // 10s countdown starts for the new result. This only governs the idle return
  // when no further tap arrives.
  const RESULT_HOLD_MS = 10_000;
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      inputRef.current?.focus();
    }, RESULT_HOLD_MS);
    return () => clearTimeout(t);
  }, [result]);

  function beep(kind: "ok" | "bad" | "queued") {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (audioRef.current ??= new Ctor());
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "ok" ? 880 : kind === "queued" ? 660 : 220;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      /* no audio */
    }
  }

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* no speech */
    }
  }

  function pushRecent(t: RecentTap) {
    setRecent((list) => [t, ...list].slice(0, 8));
  }

  // A USB RFID reader types the card number as a rapid keystroke burst; a human
  // types far slower. We submit on Enter (which readers emit) for both, but also
  // auto-submit shortly after a fast burst so a reader that omits Enter still
  // works — without firing on slow manual typing.
  const BURST_GAP_MS = 35; // keys closer than this look machine-generated
  const BURST_IDLE_MS = 80; // a scan settles ~this long after its last key

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      void submit(scan.trim());
      return;
    }
    if (e.key.length !== 1) return; // ignore Shift/Arrow/etc.

    const now = Date.now();
    const gap = now - lastKeyAtRef.current;
    lastKeyAtRef.current = now;
    if (scan.length === 0) burstRef.current = true; // fresh entry
    else if (gap > BURST_GAP_MS) burstRef.current = false; // a slow gap = manual typing

    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => {
      const value = inputRef.current?.value.trim() ?? "";
      if (burstRef.current && value.length >= 3) void submit(value);
    }, BURST_IDLE_MS);
  }

  async function syncQueue() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const taps = await getQueuedTaps();
    if (taps.length === 0) return;
    setSyncing(true);

    const byCounter = new Map<string, QueuedTap[]>();
    for (const t of taps) {
      const arr = byCounter.get(t.counterId) ?? [];
      arr.push(t);
      byCounter.set(t.counterId, arr);
    }

    const all: SyncResult[] = [];
    let failed = false;
    for (const [cid, group] of byCounter) {
      try {
        const r = await fetch("/api/counter/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counterId: cid,
            taps: group.map((g) => ({ cardUid: g.cardUid, clientTxId: g.clientTxId, at: g.at })),
          }),
        });
        if (r.ok) {
          const data = (await r.json()) as { results: SyncResult[] };
          all.push(...data.results);
          // Resolved taps are dropped from the queue; ERROR taps failed transiently
          // on the server (idempotent) and stay queued to retry on the next sync.
          const resolved = data.results.filter((x) => x.status !== "ERROR");
          await removeTaps(resolved.map((x) => x.clientTxId));
          if (resolved.length < data.results.length) failed = true;
        } else {
          failed = true; // server rejected the batch — leave it queued to retry
        }
      } catch {
        failed = true; // still offline / network failed — leave queued
      }
    }

    if (all.length > 0) {
      setRecent((list) =>
        list.map((t) => {
          const r = all.find((x) => x.clientTxId === t.key);
          return r ? { ...t, status: r.status as TapResult["status"], charged: r.charged, paidBy: r.paidBy, meal: r.meal } : t;
        }),
      );
      setSyncReport({
        approved: all.filter((r) => r.status === "APPROVED").length,
        rejected: all.filter((r) => r.status === "REJECTED").length,
        blocked: all.filter((r) => r.status === "BLOCKED").length,
      });
    }
    // Surface a stuck queue rather than letting it fail silently.
    setSyncError(failed ? "Couldn’t sync some taps — still queued, will retry." : null);
    setQueued(await queueCount());
    setSyncing(false);
  }

  async function queueOffline(cardUid: string, clientTxId: string) {
    await enqueueTap({ clientTxId, cardUid, counterId, at: new Date().toISOString() });
    setQueued(await queueCount());
    const res: TapResult = { status: "QUEUED", reason: "Saved — will sync when online" };
    setResult(res);
    beep("queued");
    speak("Queued");
    pushRecent({ key: clientTxId, name: cardUid, status: "QUEUED", at: new Date().toLocaleTimeString() });
  }

  async function submit(cardUid: string) {
    if (!cardUid || busy || !counterId) return;
    setBusy(true);
    setSyncReport(null);
    const clientTxId = crypto.randomUUID();

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await queueOffline(cardUid, clientTxId);
      setScan("");
      burstRef.current = true;
      lastKeyAtRef.current = 0;
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    try {
      const r = await fetch("/api/counter/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardUid, counterId, clientTxId }),
      });

      if (r.ok) {
        // 200 → the server's business decision (APPROVED / REJECTED / BLOCKED).
        const res = (await r.json()) as TapResult;
        setResult(res);
        const ok = res.status === "APPROVED";
        beep(ok ? "ok" : "bad");
        speak(ok ? "Accepted" : "Rejected");
        pushRecent({
          key: clientTxId,
          name: res.cardholder?.name ?? cardUid,
          status: res.status,
          meal: res.meal?.name,
          charged: res.charged,
          paidBy: res.paidBy,
          at: new Date().toLocaleTimeString(),
        });
      } else if (r.status >= 500) {
        // Server error — the tap is idempotent, so queue and let sync retry it
        // rather than telling the operator the card was declined.
        await queueOffline(cardUid, clientTxId);
      } else {
        // 4xx (bad request / forbidden) — a system ERROR, never a card decline.
        const data = await r.json().catch(() => null);
        const res: TapResult = { status: "ERROR", reason: data?.error ?? "Request failed — try again" };
        setResult(res);
        beep("bad");
        speak("Error");
        pushRecent({ key: clientTxId, name: cardUid, status: "ERROR", at: new Date().toLocaleTimeString() });
      }
    } catch {
      // network dropped mid-request — queue it (idempotent on the server).
      await queueOffline(cardUid, clientTxId);
    }

    setScan("");
    burstRef.current = true;
    lastKeyAtRef.current = 0;
    setBusy(false);
    inputRef.current?.focus();
  }

  const ch = result?.cardholder;

  const selectedCounter = counters.find((c) => c.id === counterId);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      {/* Topbar */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3.5 border-b border-line bg-canvas/85 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 shrink-0" />
          <span className="font-display text-base font-bold tracking-[-0.2px] text-ink">RFID Counter</span>
        </div>
        <CounterDropdown counters={counters} value={counterId} onChange={setCounterId} />

        <div className="ml-auto flex items-center gap-3.5">
          {queued > 0 ? (
            <button
              type="button"
              onClick={() => void syncQueue()}
              disabled={syncing || !online}
              className="inline-flex items-center gap-1.5 rounded-pill bg-gold-soft px-3 py-1.5 text-[12.5px] font-semibold text-gold-deep disabled:opacity-60"
            >
              <span className="size-2 rounded-full bg-gold-deep" />
              {syncing ? "Syncing…" : `${queued} queued`}
            </button>
          ) : null}
          <ThemeToggleButton />
          <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
            <span className={`size-2 rounded-full ${online ? "bg-sage shadow-[0_0_0_3px_var(--sage-soft)]" : "bg-tomato shadow-[0_0_0_3px_var(--tomato-soft)]"}`} />
            {online ? "Online" : "Offline"}
          </span>
          <span className="hidden text-[13px] font-medium text-ink sm:inline">{operatorName}</span>
          {counterOnly ? (
            <SignOutButton className="rounded-pill border border-line-strong bg-surface px-[18px] py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep disabled:opacity-60">
              Logout
            </SignOutButton>
          ) : (
            <Link href="/vendor-dashboard" className="rounded-pill border border-line-strong bg-surface px-[18px] py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep">
              Exit
            </Link>
          )}
        </div>
      </header>

      {syncError ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-line bg-tomato-soft px-5 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-tomato">
            <span className="size-2 rounded-full bg-tomato" />
            {syncError}
          </span>
          <button type="button" onClick={() => void syncQueue()} disabled={syncing || !online} className="font-semibold text-tomato underline disabled:opacity-60">
            Retry now
          </button>
        </div>
      ) : null}

      {syncReport ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-2 text-sm">
          <span className="text-ink-2">
            Synced: <span className="font-semibold text-sage-deep">{syncReport.approved} approved</span>
            {syncReport.rejected + syncReport.blocked > 0 ? (
              <>, <span className="font-semibold text-tomato">{syncReport.rejected + syncReport.blocked} not applied</span> (balance/rules changed)</>
            ) : null}
            .
          </span>
          <button type="button" onClick={() => setSyncReport(null)} className="text-muted hover:text-ink-2" aria-label="Dismiss">✕</button>
        </div>
      ) : null}

      {/* Stage */}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 p-4 sm:px-5 sm:pb-5 lg:grid-cols-[1fr_270px]">
        <section className="flex min-h-0 flex-col">
          <div
            className={`flex min-h-[440px] flex-1 flex-col items-center justify-center rounded-md border p-8 text-center shadow-sm transition-colors sm:p-12 ${
              result ? STATUS_STYLE[result.status].panel : "border-line bg-surface"
            }`}
          >
            {!result ? (
              <>
                <div className="tap-ring relative mb-7 grid size-24 place-items-center rounded-full border border-gold-soft-2 bg-gold-soft text-gold-deep">
                  <CardReaderGlyph className="size-10" />
                </div>
                <p className="font-display text-[30px] font-bold tracking-[-0.6px] text-ink">Tap a card</p>
                <p className="mt-2 text-[13px] text-muted-2">Waiting for the reader…</p>
              </>
            ) : (
              <>
                {ch?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external cardholder photo
                  <img src={ch.photoUrl} alt={ch.name ? `Photo of ${ch.name}` : "Cardholder photo"} className="mb-5 size-36 rounded-md border border-line object-cover shadow-md" />
                ) : (
                  <div className={`mb-5 grid size-24 place-items-center rounded-full ${STATUS_STYLE[result.status].ring}`}>
                    {result.status === "QUEUED" ? <CardReaderGlyph className="size-10" /> : <span className="font-display text-4xl font-bold">{ch?.name ? ch.name.slice(0, 1).toUpperCase() : "?"}</span>}
                  </div>
                )}

                <span className={`mb-3 rounded-pill px-5 py-1.5 text-lg font-bold tracking-wide ${STATUS_STYLE[result.status].chip}`}>
                  {result.status}
                </span>

                {ch ? (
                  <div>
                    <p className={`font-display text-2xl font-bold ${STATUS_STYLE[result.status].title}`}>{ch.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-2"><span className="font-mono">{ch.code}</span> · {ch.category}</p>
                  </div>
                ) : null}

                <p className="mt-2 text-[15px] font-medium text-ink-2">{result.reason}</p>

                {ch ? (
                  <div className="mt-6 flex flex-wrap items-start justify-center gap-x-8 gap-y-3">
                    {result.meal ? (
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">Meal</div>
                        <div className="mt-0.5 text-[17px] font-bold text-ink">{result.meal.name}</div>
                      </div>
                    ) : null}
                    {result.status === "APPROVED" ? (
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">Charged</div>
                        <div className="mt-0.5 font-mono text-[17px] font-bold tabular-nums text-ink">{result.paidBy === "coupon" ? "Coupon" : `₹${result.charged}`}</div>
                      </div>
                    ) : null}
                    <div className="text-center">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2">Balance</div>
                      <div className="mt-0.5 font-mono text-[17px] font-bold tabular-nums text-ink">₹{ch.walletBalance}</div>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {/* selected-counter chip */}
            <div className="mt-7 inline-flex items-center gap-2 rounded-pill border border-line bg-surface-2 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              <span className="size-[7px] rounded-full bg-gold" />
              {selectedCounter?.name ?? "No counter"}
            </div>
          </div>

          {/* Hidden capture field — the USB reader types the card number here while
              it stays focused, so the operator never clicks: just tap. Kept in the
              DOM (visually hidden, not display:none) so it can hold focus. */}
          <input
            ref={inputRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={onScanKeyDown}
            disabled={busy}
            inputMode="none"
            autoComplete="off"
            aria-label="Card scan"
            className="sr-only"
          />
        </section>

        <aside className="flex max-h-[280px] flex-col overflow-hidden rounded-md border border-line bg-surface shadow-sm lg:max-h-none">
          <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
            <span className="h-[15px] w-1 rounded-full bg-gold" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-2">Recent</h2>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 pb-4 text-[13px] text-muted">No taps yet.</p>
          ) : (
            <ul className="overflow-y-auto pb-2">
              {recent.map((t) => (
                <li key={t.key} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--gold),var(--sage))] text-[12px] font-bold text-white">
                    {t.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{t.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-2">
                      <span className={`size-[6px] shrink-0 rounded-full ${dotFor(t.status)}`} />
                      {/* status as text, not colour alone (theme.md §8 / a11y) */}
                      <span className="uppercase tracking-wide">{t.status}</span>
                      {t.meal ? <span>· {t.meal}</span> : null}
                      <span>· {t.at}</span>
                    </span>
                  </span>
                  {/* Mirror the main panel: a coupon-paid tap reads "Coupon", not ₹0.00. */}
                  {t.status === "APPROVED" ? (
                    t.paidBy === "coupon" ? (
                      <span className="shrink-0 rounded-pill bg-sage-soft-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-deep">Coupon</span>
                    ) : t.charged ? (
                      <span className="shrink-0 font-mono text-[13px] font-bold text-sage-deep">₹{t.charged}</span>
                    ) : null
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
