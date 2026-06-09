"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DateRangePicker as RdrRangePicker,
  createStaticRanges,
  type Range,
  type RangeKeyDict,
} from "react-date-range";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
} from "date-fns";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "./date-range-picker.css";

/**
 * Quick presets shown on the left of the calendar. "This week/month" run from
 * their start up to *today* (history never looks ahead); "last week/month" are
 * the full prior period. Selecting on the calendar instead is the "custom" path.
 */
const PRESETS = createStaticRanges([
  { label: "Today", range: () => ({ startDate: startOfDay(new Date()), endDate: endOfDay(new Date()) }) },
  {
    label: "Yesterday",
    range: () => {
      const y = subDays(new Date(), 1);
      return { startDate: startOfDay(y), endDate: endOfDay(y) };
    },
  },
  { label: "This Week", range: () => ({ startDate: startOfWeek(new Date()), endDate: endOfDay(new Date()) }) },
  {
    label: "Last Week",
    range: () => {
      const lw = subWeeks(new Date(), 1);
      return { startDate: startOfWeek(lw), endDate: endOfWeek(lw) };
    },
  },
  { label: "This Month", range: () => ({ startDate: startOfMonth(new Date()), endDate: endOfDay(new Date()) }) },
  {
    label: "Last Month",
    range: () => {
      const lm = subMonths(new Date(), 1);
      return { startDate: startOfMonth(lm), endDate: endOfMonth(lm) };
    },
  },
]);

/**
 * Shared "Warm Cafeteria"-themed date-range picker (react-date-range in a
 * popover). Controlled: the parent owns the `from`/`to` strings (YYYY-MM-DD) and
 * receives both back on every change. Used by reporting filters, public history,
 * and the settlement period — anywhere the app needs a date range.
 */

function parseYmd(s: string | undefined): Date {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function label(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function DateRangePicker({
  from,
  to,
  onChange,
  maxToday = false,
  ariaLabel = "Date range",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Cap the selectable range at today (history/reports never look ahead). */
  maxToday?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const startDate = parseYmd(from);
  const endDate = parseYmd(to);

  // Clamp the popover into the viewport (8px gutter) whichever way the trigger
  // sits — a left-anchored popover would run off the right edge in the reports
  // header, and right-anchoring would run off the left on a phone. We measure the
  // real width (after the responsive stacking) and shift, so it always fits.
  useLayoutEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    const trigger = ref.current.getBoundingClientRect();
    const popW = popRef.current.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const desired = Math.max(8, Math.min(trigger.left, vw - popW - 8));
    setOffsetLeft(desired - trigger.left); // relative to the positioned wrapper
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handle = (r: RangeKeyDict) => {
    const sel = r.selection;
    if (sel.startDate && sel.endDate) onChange(fmtYmd(sel.startDate), fmtYmd(sel.endDate));
  };

  const ranges: Range[] = [{ startDate, endDate, key: "selection" }];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex items-center gap-2 rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink transition-colors hover:border-gold focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className="font-mono">{label(startDate)} &ndash; {label(endDate)}</span>
      </button>
      {open ? (
        <div ref={popRef} role="dialog" style={{ left: offsetLeft }} className="absolute z-30 mt-2 max-w-[calc(100vw-1rem)] overflow-auto rounded-md border border-line bg-surface shadow-lg">
          <RdrRangePicker
            ranges={ranges}
            onChange={handle}
            staticRanges={PRESETS}
            inputRanges={[]}
            moveRangeOnFirstSelection={false}
            editableDateInputs
            maxDate={maxToday ? new Date() : undefined}
            rangeColors={["var(--gold)"]}
            showMonthAndYearPickers
            showDateDisplay={false}
          />
        </div>
      ) : null}
    </div>
  );
}
