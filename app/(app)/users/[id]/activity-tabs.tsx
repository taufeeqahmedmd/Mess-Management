"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Pane = "recharges" | "meals" | "cards";

/**
 * Activity panel with Recharges / Meals / Card-history tabs. The three panes are
 * server-rendered (tables + timeline) and passed in as nodes; this client shell
 * only toggles which is visible. Counts shown as tab badges.
 */
export function ActivityTabs({
  counts,
  recharges,
  meals,
  cards,
}: {
  counts: { recharges: number; meals: number; cards: number };
  recharges: ReactNode;
  meals: ReactNode;
  cards: ReactNode;
}) {
  const [pane, setPane] = useState<Pane>("recharges");
  const tabs: { key: Pane; label: string; count: number }[] = [
    { key: "recharges", label: "Recharges", count: counts.recharges },
    { key: "meals", label: "Meals", count: counts.meals },
    { key: "cards", label: "Card history", count: counts.cards },
  ];

  return (
    <section className="rounded-md border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="h-[17px] w-1 rounded-full bg-navy" />
        <div>
          <h2 className="font-display text-base font-bold text-ink">Activity</h2>
          <p className="text-[12px] text-muted">Recharges, meals and card events.</p>
        </div>
        <div className="ml-auto flex w-fit gap-1 rounded-md border border-line bg-surface-2 p-1" role="tablist">
          {tabs.map((t) => {
            const on = pane === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPane(t.key)}
                className={`inline-flex items-center gap-2 rounded-sm px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  on ? "bg-surface text-gold-deep shadow-sm" : "text-muted hover:text-gold-deep"
                }`}
              >
                {t.label}
                <span className={`rounded-pill border px-1.5 text-[10.5px] font-bold tabular-nums ${on ? "border-gold-soft-2 text-gold-deep" : "border-line-strong text-muted"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        {pane === "recharges" ? recharges : pane === "meals" ? meals : cards}
      </div>
    </section>
  );
}
