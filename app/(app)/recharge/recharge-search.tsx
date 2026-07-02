"use client";

import { useEffect, useRef, useState } from "react";
import { INPUT_FIND, PANEL, BTN_PRIMARY } from "@/components/ui/controls";

type Match = { id: string; code: string; fullName: string; category: string };

/**
 * Live cardholder search for the recharge page. As the operator types a name,
 * code, phone, or taps an RFID card (the reader types the UID here), matches
 * appear without pressing a button — a debounced call to /api/recharges/search.
 * Each match's "Recharge" button carries `data-recharge-user`, which the existing
 * RechargeDrawer already listens for, so clicking it opens the recharge form.
 * Pressing Enter with exactly one match opens it (handy for the RFID-tap flow).
 */
export function RechargeSearch() {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      if (!term) {
        setMatches([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/recharges/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) {
          setMatches(await res.json());
          setSearched(true);
        }
      } catch {
        /* aborted (newer keystroke) or network error — keep prior matches */
      } finally {
        setLoading(false);
      }
    }, term ? 200 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  function openRecharge(id: string) {
    // Delegate to the mounted RechargeDrawer, which opens on this data-attr click.
    document.querySelector<HTMLButtonElement>(`[data-recharge-user="${id}"]`)?.click();
  }

  const term = q.trim();

  return (
    <div className={`${PANEL} p-[18px_20px]`}>
      <input
        ref={inputRef}
        value={q}
        autoFocus
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches.length === 1) openRecharge(matches[0].id);
          }
        }}
        placeholder="Find a cardholder to recharge…"
        aria-label="Find a cardholder to recharge"
        className={`${INPUT_FIND} sm:max-w-[420px]`}
      />
      {term ? (
        <div className="mt-3 flex flex-col gap-1.5">
          {loading && matches.length === 0 ? (
            <p className="text-sm text-muted">Searching…</p>
          ) : matches.length === 0 ? (
            searched ? <p className="text-sm text-muted">No cardholders match.</p> : null
          ) : (
            matches.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[13px]"
              >
                <span className="text-ink">
                  <span className="font-mono">{u.code}</span> · {u.fullName} · {u.category}
                </span>
                <button type="button" data-recharge-user={u.id} className={BTN_PRIMARY}>Recharge</button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
