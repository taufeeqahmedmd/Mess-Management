"use client";

import { useState } from "react";
import { useDismiss } from "@/components/shell/hooks";
import { CheckSquare } from "./check-square";

type Option = { value: string; label: string };

/**
 * Themed multi-select dropdown (the native <select multiple> open list can't be
 * styled). Controlled: parent owns `selected`. Selection is returned in option
 * order. Modern look: selected values show as chips in the trigger; the menu
 * uses square checkboxes with hover/selected states.
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
  const chosen = options.filter((o) => set.has(o.value));

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
        className="flex min-h-10 w-full min-w-48 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:border-gold/60 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        {chosen.length === 0 ? (
          <span className="px-1 text-muted-2">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {chosen.map((o) => (
              <span key={o.value} className="rounded-pill bg-gold-soft px-2 py-0.5 text-xs font-medium text-ink">
                {o.label}
              </span>
            ))}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1.5 w-full min-w-52 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-lg"
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
                className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm transition-colors ${
                  on ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10"
                }`}
              >
                <CheckSquare checked={on} />
                <span className="text-ink">{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
