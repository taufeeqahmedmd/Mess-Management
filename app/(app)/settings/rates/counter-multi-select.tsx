"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "@/components/shell/hooks";
import { CheckSquare } from "@/components/ui/check-square";

export type CounterOption = { id: string; label: string; sub?: string };

/**
 * Modern multi-select for the counter column, with a tri-state "Select all". The
 * menu is position:fixed (anchored to the button) so it isn't clipped by the
 * rates table's horizontal scroll. Empty selection = all counters (the branch
 * default row). Closes on outside click, scroll, or resize.
 */
export function CounterMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All counters (default)",
}: {
  options: CounterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const btnRef = useRef<HTMLButtonElement>(null);
  const set = new Set(selected);
  const chosen = options.filter((o) => set.has(o.id));

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 224) });
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const allSelected = options.length > 0 && options.every((o) => set.has(o.id));
  const someSelected = selected.length > 0 && !allSelected;
  function toggle(id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(options.map((o) => o.id).filter((x) => next.has(x)));
  }
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.id));

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Counters"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex min-h-10 w-full min-w-44 max-w-64 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:border-gold/60 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        {selected.length === 0 ? (
          <span className="px-1 text-muted-2">{placeholder}</span>
        ) : allSelected ? (
          <span className="rounded-pill bg-gold-soft px-2 py-0.5 text-xs font-medium text-ink">All counters</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {chosen.map((o) => (
              <span key={o.id} className="rounded-pill bg-gold-soft px-2 py-0.5 text-xs font-medium text-ink">
                {o.sub ?? o.label}
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

      {open && coords ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Counters"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          className="z-[100] max-h-72 overflow-auto rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-2">No counters.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="mb-1 flex w-full items-center gap-2.5 rounded-sm border-b border-line px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-gold/10"
              >
                <CheckSquare checked={allSelected} indeterminate={someSelected} />
                Select all
              </button>
              {options.map((o) => {
                const on = set.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.id)}
                    className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm transition-colors ${on ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10"}`}
                  >
                    <CheckSquare checked={on} />
                    <span className="text-ink">{o.label}</span>
                    {o.sub ? <span className="ml-auto font-mono text-xs text-muted">{o.sub}</span> : null}
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
