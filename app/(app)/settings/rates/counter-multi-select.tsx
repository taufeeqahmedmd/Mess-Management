"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "@/components/shell/hooks";

export type CounterOption = { id: string; label: string; sub?: string };

/**
 * Compact multi-select for the counter column, with a "Select all" toggle. The
 * menu is position:fixed (anchored to the button) so it isn't clipped by the
 * rates table's horizontal scroll container. Empty selection = all counters
 * (the branch default row). Closes on outside click, scroll, or resize.
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

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 208) });
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
  function toggle(id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(options.map((o) => o.id).filter((x) => next.has(x)));
  }
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.id));

  const labelText =
    selected.length === 0
      ? placeholder
      : allSelected
        ? "All counters"
        : options.filter((o) => set.has(o.id)).map((o) => o.label).join(", ");

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Counters"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex min-w-44 max-w-60 items-center justify-between gap-2 rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 text-left text-sm transition-colors focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <span className={`truncate ${selected.length ? "text-ink" : "text-muted-2"}`}>{labelText}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0 text-muted">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && coords ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Counters"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          className="z-[100] max-h-64 overflow-auto rounded-sm border border-line bg-surface shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-2">No counters.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-gold/10"
              >
                <span aria-hidden="true">{allSelected ? "●" : "○"}</span>
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
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${on ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10 hover:text-gold-deep"}`}
                  >
                    <span aria-hidden="true">{on ? "●" : "○"}</span>
                    <span>{o.label}</span>
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
