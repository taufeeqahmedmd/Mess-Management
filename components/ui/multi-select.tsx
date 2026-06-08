"use client";

import { useState } from "react";
import { useDismiss } from "@/components/shell/hooks";

type Option = { value: string; label: string };

/**
 * Themed multi-select dropdown (the native <select multiple> open list can't be
 * styled). Controlled: parent owns `selected`. Selection is returned in the
 * option order, not click order.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  ariaLabel,
  placeholder = "Select…",
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const set = new Set(selected);
  const labels = options.filter((o) => set.has(o.value)).map((o) => o.label);

  function toggle(value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-48 items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-left text-sm transition-colors focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <span className={labels.length ? "text-ink" : "text-muted-2"}>
          {labels.length ? labels.join(", ") : placeholder}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0 text-muted">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 w-full min-w-48 overflow-hidden rounded-sm border border-line bg-surface shadow-lg"
        >
          {options.map((o) => {
            const on = set.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  on ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10 hover:text-gold-deep"
                }`}
              >
                <span aria-hidden="true">{on ? "●" : "○"}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
