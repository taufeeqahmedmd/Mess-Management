"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  enqueueTap,
  getQueuedTaps,
  removeTaps,
  queueCount,
  type QueuedTap,
} from "@/lib/offline-queue";

type Counter = { id: string; name: string; code: string };

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

type RecentTap = { key: string; name: string; status: TapResult["status"]; meal?: string; charged?: string; at: string };
type SyncResult = { clientTxId: string; status: string; reason: string; name?: string; charged?: string; meal?: string };

const STATUS_STYLE: Record<TapResult["status"], { panel: string; chip: string }> = {
  APPROVED: { panel: "border-sage bg-sage-soft", chip: "bg-sage-deep text-white" },
  REJECTED: { panel: "border-tomato bg-tomato-soft", chip: "bg-tomato text-white" },
  BLOCKED: { panel: "border-tomato bg-tomato-soft", chip: "bg-tomato text-white" },
  QUEUED: { panel: "border-gold bg-gold-soft", chip: "bg-gold-deep text-white" },
  // Neutral, not red — this is a system error to retry, not a card decline.
  ERROR: { panel: "border-line-strong bg-surface-2", chip: "bg-ink-2 text-white" },
};

function dotFor(status: TapResult["status"]) {
  if (status === "APPROVED") return "bg-sage";
  if (status === "QUEUED") return "bg-gold-deep";
  if (status === "ERROR") return "bg-ink-2";
  return "bg-tomato";
}

export function CounterScreen({ counters, operatorName }: { counters: Counter[]; operatorName: string }) {
  const [counterId, setCounterId] = useState(counters[0]?.id ?? "");
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<TapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentTap[]>([]);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<{ approved: number; rejected: number; blocked: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

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
    const goOnline = () => {
      setOnline(true);
      void syncQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("click", refocus);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("click", refocus);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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
          return r ? { ...t, status: r.status as TapResult["status"], charged: r.charged, meal: r.meal } : t;
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

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-semibold text-ink">RFID Counter</span>
          <select
            value={counterId}
            onChange={(e) => setCounterId(e.target.value)}
            aria-label="Counter"
            className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
          >
            {counters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {queued > 0 ? (
            <button
              type="button"
              onClick={() => void syncQueue()}
              disabled={syncing || !online}
              className="inline-flex items-center gap-1.5 rounded-pill bg-gold-soft px-3 py-1 font-medium text-gold-deep disabled:opacity-60"
            >
              <span className="size-2 rounded-pill bg-gold-deep" />
              {syncing ? "Syncing…" : `${queued} queued`}
            </button>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className={`size-2 rounded-pill ${online ? "bg-sage" : "bg-tomato"}`} />
            {online ? "Online" : "Offline"}
          </span>
          <span className="text-ink-2">{operatorName}</span>
          <Link href="/dashboard" className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">
            Exit
          </Link>
        </div>
      </header>

      {syncError ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-line bg-tomato-soft px-5 py-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-tomato">
            <span className="size-2 rounded-pill bg-tomato" />
            {syncError}
          </span>
          <button type="button" onClick={() => void syncQueue()} disabled={syncing || !online} className="font-medium text-tomato underline disabled:opacity-60">
            Retry now
          </button>
        </div>
      ) : null}

      {syncReport ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-2 text-sm">
          <span className="text-ink-2">
            Synced: <span className="font-medium text-sage-deep">{syncReport.approved} approved</span>
            {syncReport.rejected + syncReport.blocked > 0 ? (
              <>, <span className="font-medium text-tomato">{syncReport.rejected + syncReport.blocked} not applied</span> (balance/rules changed)</>
            ) : null}
            .
          </span>
          <button type="button" onClick={() => setSyncReport(null)} className="text-muted hover:text-ink-2" aria-label="Dismiss">✕</button>
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-4">
          <div
            className={`flex min-h-[360px] flex-1 flex-col items-center justify-center gap-5 rounded-lg border-2 p-8 text-center transition-colors ${
              result ? STATUS_STYLE[result.status].panel : "border-line bg-surface"
            }`}
          >
            {!result ? (
              <>
                <p className="font-display text-3xl font-semibold text-ink">Tap a card</p>
                <p className="text-sm text-muted">Waiting for the reader…</p>
              </>
            ) : (
              <>
                {ch?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external cardholder photo
                  <img src={ch.photoUrl} alt={ch.name ? `Photo of ${ch.name}` : "Cardholder photo"} className="size-40 rounded-md border border-line object-cover shadow-md" />
                ) : (
                  <div className="grid size-40 place-items-center rounded-md border border-line bg-surface-2">
                    <span className="font-display text-4xl font-semibold text-muted-2">
                      {ch?.name ? ch.name.slice(0, 1).toUpperCase() : result.status === "QUEUED" ? "⏱" : "?"}
                    </span>
                  </div>
                )}

                <span className={`rounded-pill px-5 py-1.5 text-lg font-bold tracking-wide ${STATUS_STYLE[result.status].chip}`}>
                  {result.status}
                </span>

                {ch ? (
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">{ch.name}</p>
                    <p className="mt-0.5 text-sm text-ink-2"><span className="font-mono">{ch.code}</span> · {ch.category}</p>
                  </div>
                ) : null}

                <p className="text-base font-medium text-ink-2">{result.reason}</p>

                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-ink-2">
                  {result.meal ? <span>Meal: <span className="font-medium text-ink">{result.meal.name}</span></span> : null}
                  {result.status === "APPROVED" ? (
                    <span>{result.paidBy === "coupon" ? "Coupon" : `Charged ₹${result.charged}`}</span>
                  ) : null}
                  {ch ? <span>Wallet: <span className="font-mono text-ink">₹{ch.walletBalance}</span></span> : null}
                </div>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={onScanKeyDown}
            disabled={busy}
            inputMode="text"
            autoComplete="off"
            aria-label="Card scan"
            placeholder={busy ? "Reading…" : "Scan or type a card / ID, then Enter"}
            className="w-full rounded-md border border-line-strong bg-surface px-4 py-4 text-center font-mono text-xl tracking-[0.1em] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          />
        </section>

        <aside className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted">Recent</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-2">No taps yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-pill ${dotFor(t.status)}`} />
                      <span className="truncate text-ink">{t.name}</span>
                    </span>
                    {/* status as text, not colour alone (theme.md §8 / a11y) */}
                    <span className="ml-3 text-[11px] font-semibold uppercase tracking-wide text-ink-2">{t.status}</span>
                    {t.meal ? <span className="ml-2 text-xs text-muted">{t.meal}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">{t.at}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
