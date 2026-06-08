"use client";

import Link from "next/link";
import { useState } from "react";
import { publicCodeSchema } from "@/lib/public-schema";
import type { PublicBalance, PublicHistoryRow } from "@/services/public-lookup";

type HistoryData = { name: string; from: string; to: string; rows: PublicHistoryRow[] };

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  inactive: "Inactive",
};

function statusDot(status: string) {
  return status === "active" ? "bg-sage" : status === "suspended" ? "bg-tomato" : "bg-muted-2";
}

export function LookupClient() {
  const [code, setCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [balance, setBalance] = useState<PublicBalance | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchHistory(lookupCode: string, f: string, t: string): Promise<HistoryData | null> {
    const qs = new URLSearchParams({ code: lookupCode });
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    const res = await fetch(`/api/public/history?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HistoryData;
  }

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    const parsed = publicCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setBalance(null);
    setHistory(null);
    try {
      const res = await fetch(`/api/public/balance?code=${encodeURIComponent(parsed.data)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setBalance(body as PublicBalance);
      const hist = await fetchHistory(parsed.data, from, to);
      if (hist) {
        setHistory(hist);
        setFrom(hist.from);
        setTo(hist.to);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onFilterHistory(e: React.FormEvent) {
    e.preventDefault();
    if (!balance) return;
    setLoading(true);
    const hist = await fetchHistory(balance.code, from, to);
    if (hist) {
      setHistory(hist);
      setFrom(hist.from);
      setTo(hist.to);
    }
    setLoading(false);
  }

  const csvHref =
    balance && history
      ? `/api/public/history?${new URLSearchParams({ code: balance.code, from: history.from, to: history.to, format: "csv" }).toString()}`
      : "#";

  const field =
    "rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold text-ink">Check your balance</h1>
          <p className="mt-1 text-sm text-ink-2">
            Enter your ID to view your wallet, meal coupons, and recent meals.
          </p>
        </header>

        <form onSubmit={onLookup} aria-label="Balance lookup" className="rounded-lg bg-surface p-5 shadow-lg sm:p-6">
          <label htmlFor="code" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Admission / Employee ID
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="code"
              name="code"
              type="text"
              autoComplete="off"
              inputMode="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. EMP1001"
              aria-invalid={error ? true : undefined}
              className="input--rfid min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 font-mono tracking-[0.04em] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Looking up…" : "Look up"}
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-tomato">
              {error}
            </p>
          ) : null}
        </form>

        {balance ? (
          <section aria-live="polite" className="flex flex-col gap-5">
            <div className="rounded-lg bg-surface p-5 shadow-lg sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">{balance.name}</h2>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {balance.category} · <span className="font-mono">{balance.code}</span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1 text-sm text-ink-2">
                  <span className={`size-2 rounded-pill ${statusDot(balance.status)}`} />
                  {STATUS_LABEL[balance.status] ?? balance.status}
                </span>
              </div>

              {balance.validity.expired ? (
                <p role="alert" className="mt-3 rounded-sm bg-tomato-soft px-3 py-2 text-sm text-tomato">
                  Your validity has expired. Please contact the mess office.
                </p>
              ) : balance.validity.expiresOn ? (
                <p className="mt-3 text-xs text-muted">Valid till {balance.validity.expiresOn}</p>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-gold-soft p-4">
                  <p className="text-xs font-medium text-muted">Wallet balance</p>
                  <p className="mt-1 font-display text-3xl font-semibold text-ink">₹{balance.wallet}</p>
                </div>
                <div className="rounded-md bg-surface-2 p-4">
                  <p className="text-xs font-medium text-muted">Meal coupons</p>
                  {balance.coupons.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-2">No coupons.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1">
                      {balance.coupons.map((c) => (
                        <li key={c.meal} className="flex items-center justify-between text-sm">
                          <span className="text-ink-2">{c.meal}</span>
                          <span className="font-mono font-semibold text-ink">{c.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-surface p-5 shadow-lg sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink">Recent meals</h2>
                <a
                  href={csvHref}
                  className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
                >
                  Download CSV
                </a>
              </div>

              <form onSubmit={onFilterHistory} className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  From
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep disabled:opacity-60"
                >
                  Apply
                </button>
              </form>

              <div className="mt-4 overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                      <th className="px-4 py-2.5 font-semibold">When</th>
                      <th className="px-4 py-2.5 font-semibold">Meal</th>
                      <th className="px-4 py-2.5 font-semibold">Paid by</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!history || history.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-ink-2">
                          No meals in this range.
                        </td>
                      </tr>
                    ) : (
                      history.rows.map((r, i) => (
                        <tr key={`${r.date}-${i}`} className="border-t border-line">
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-2">
                            {r.date.slice(0, 16).replace("T", " ")}
                          </td>
                          <td className="px-4 py-2.5 text-ink-2">{r.meal}</td>
                          <td className="px-4 py-2.5 text-ink-2">
                            {r.paidBy === "coupon" ? "Coupon" : r.paidBy === "wallet" ? "Wallet" : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-ink-2">
                            {r.paidBy === "coupon" ? "—" : `₹${r.amount}`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <footer className="text-center text-xs text-muted">
          <Link href="/login" className="transition-colors hover:text-gold-deep">
            Staff sign in
          </Link>
        </footer>
      </div>
    </main>
  );
}
