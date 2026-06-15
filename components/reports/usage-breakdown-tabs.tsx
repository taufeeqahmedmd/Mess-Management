"use client";

import { useRef, useState, type ReactNode } from "react";

const fmtSale = (n: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;

export type UsageTab = { id: string; label: string; content: ReactNode };

/**
 * Single "Usage breakdown" card that tabs the category / meal / counter tables
 * (server-rendered {@link BreakdownTableInner} nodes passed as `content`). Only
 * the tab switch is client-side; the tables — and their Decimal money — stay on
 * the server. Keyboard: roving tabindex + arrow / Home / End, per WAI-ARIA tabs.
 */
export function UsageBreakdownTabs({
  tabs,
  taps,
  sale,
  className,
}: {
  tabs: UsageTab[];
  taps: number;
  sale: number;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = tabs.length - 1;
    let next = active;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setActive(next);
    btnRefs.current[next]?.focus();
  };

  return (
    <div className={`overflow-hidden rounded-md border border-line bg-surface shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h3 className="font-display text-base font-bold text-ink">Usage breakdown</h3>
        <span className="text-[12px] tabular-nums text-muted-2">
          {taps} taps · {fmtSale(sale)} sale
        </span>
      </div>

      <div role="tablist" aria-label="Usage breakdown" onKeyDown={onKeyDown} className="flex gap-1 border-y border-line bg-surface-2 px-3">
        {tabs.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`usage-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`usage-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`relative px-3 py-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:text-ink ${
                selected ? "text-ink" : "text-muted hover:text-ink-2"
              }`}
            >
              {t.label}
              {selected ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" /> : null}
            </button>
          );
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`usage-panel-${t.id}`}
          aria-labelledby={`usage-tab-${t.id}`}
          hidden={i !== active}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
