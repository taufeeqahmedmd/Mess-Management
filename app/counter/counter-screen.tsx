"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Counter = { id: string; name: string; code: string };

type TapResult = {
  status: "APPROVED" | "REJECTED" | "BLOCKED" | "QUEUED";
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

const STATUS_STYLE: Record<TapResult["status"], { panel: string; chip: string }> = {
  APPROVED: { panel: "border-sage bg-sage-soft", chip: "bg-sage-deep text-white" },
  REJECTED: { panel: "border-tomato bg-tomato-soft", chip: "bg-tomato text-white" },
  BLOCKED: { panel: "border-tomato bg-tomato-soft", chip: "bg-tomato text-white" },
  QUEUED: { panel: "border-gold bg-gold-soft", chip: "bg-gold-deep text-white" },
};

export function CounterScreen({ counters, operatorName }: { counters: Counter[]; operatorName: string }) {
  const [counterId, setCounterId] = useState(counters[0]?.id ?? "");
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<TapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentTap[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const refocus = () => inputRef.current?.focus();
    const goOnline = () => setOnline(true);
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

  function beep(ok: boolean) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (audioRef.current ??= new Ctor());
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      /* audio unavailable */
    }
  }

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }

  async function submit(cardUid: string) {
    if (!cardUid || busy || !counterId) return;
    setBusy(true);
    const clientTxId = crypto.randomUUID();
    let res: TapResult;
    try {
      const r = await fetch("/api/counter/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardUid, counterId, clientTxId }),
      });
      const data = await r.json();
      res = r.ok ? (data as TapResult) : { status: "REJECTED", reason: data?.error ?? "Error" };
    } catch {
      res = { status: "REJECTED", reason: "Network error" };
    }

    setResult(res);
    const ok = res.status === "APPROVED";
    beep(ok);
    speak(ok ? "Accepted" : "Rejected");
    setRecent((list) =>
      [
        {
          key: clientTxId,
          name: res.cardholder?.name ?? cardUid,
          status: res.status,
          meal: res.meal?.name,
          charged: res.charged,
          at: new Date().toLocaleTimeString(),
        },
        ...list,
      ].slice(0, 8),
    );
    setScan("");
    setBusy(false);
    inputRef.current?.focus();
  }

  const ch = result?.cardholder;

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      {/* Top bar */}
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

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]">
        {/* Result + scan */}
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
                  <img src={ch.photoUrl} alt="" className="size-40 rounded-md border border-line object-cover shadow-md" />
                ) : (
                  <div className="grid size-40 place-items-center rounded-md border border-line bg-surface-2">
                    <span className="font-display text-4xl font-semibold text-muted-2">
                      {(ch?.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                )}

                <span className={`rounded-pill px-5 py-1.5 text-lg font-bold tracking-wide ${STATUS_STYLE[result.status].chip}`}>
                  {result.status}
                </span>

                {ch ? (
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">{ch.name}</p>
                    <p className="mt-0.5 text-sm text-ink-2">
                      <span className="font-mono">{ch.code}</span> · {ch.category}
                    </p>
                  </div>
                ) : null}

                <p className="text-base font-medium text-ink-2">{result.reason}</p>

                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-ink-2">
                  {result.meal ? <span>Meal: <span className="font-medium text-ink">{result.meal.name}</span></span> : null}
                  {result.status === "APPROVED" ? (
                    <span>
                      {result.paidBy === "coupon" ? "Coupon" : `Charged ₹${result.charged}`}
                    </span>
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(scan.trim());
              }
            }}
            disabled={busy}
            inputMode="text"
            autoComplete="off"
            aria-label="Card scan"
            placeholder={busy ? "Reading…" : "Scan or type a card / ID, then Enter"}
            className="input--rfid w-full rounded-md border border-line-strong bg-surface px-4 py-4 text-center font-mono text-xl tracking-[0.1em] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          />
        </section>

        {/* Recent taps */}
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
                      <span className={`size-2 rounded-pill ${t.status === "APPROVED" ? "bg-sage" : t.status === "QUEUED" ? "bg-gold-deep" : "bg-tomato"}`} />
                      <span className="truncate text-ink">{t.name}</span>
                    </span>
                    {t.meal ? <span className="ml-3 text-xs text-muted">{t.meal}</span> : null}
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
