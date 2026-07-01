"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/** YYYY-MM for an <input type="month">. */
function monthOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  maxToday = false,
  ariaLabel = "Date range",
  compact = false,
  active = false,
  footer,
  monthRange = false,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Cap the selectable range at today (history/reports never look ahead). */
  maxToday?: boolean;
  ariaLabel?: string;
  /** Collapse the trigger to a single filter icon (hides the date text). */
  compact?: boolean;
  /** Show a red dot on the trigger to flag that a filter is currently applied. */
  active?: boolean;
  /** Extra controls (e.g. select filters + an Apply button) rendered inside the
   *  popover below the calendar, so the whole filter UI lives behind the icon. */
  footer?: ReactNode;
  /** Show "From month / To month" pickers above the calendar — a custom range
   *  snapped to whole months (1st of From → last day of To). */
  monthRange?: boolean;
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

  // Whole-month custom range. Picking a "From"/"To" month snaps the range to the
  // 1st of the From month → last day of the To month, auto-correcting order and
  // (when maxToday) never running past today.
  const today = startOfDay(new Date());
  const todayMonth = monthOf(today);
  const capToday = (d: Date) => (maxToday && d > today ? today : d);
  const setFromMonth = (v: string) => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (!m) return;
    const start = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    const end = capToday(endDate < start ? endOfMonth(start) : endDate);
    onChange(fmtYmd(start), fmtYmd(end));
  };
  const setToMonth = (v: string) => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (!m) return;
    const end = capToday(endOfMonth(new Date(Number(m[1]), Number(m[2]) - 1, 1)));
    const start = startDate > end ? startOfMonth(end) : startDate;
    onChange(fmtYmd(start), fmtYmd(end));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? `${ariaLabel} (filter applied)` : ariaLabel}
        title={compact ? `${label(startDate)} – ${label(endDate)}` : undefined}
        className={
          compact
            ? "relative flex items-center justify-center rounded-sm border border-line-strong bg-surface-2 p-2 text-ink-2 transition-colors hover:border-gold hover:text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
            : "flex items-center gap-2 rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink transition-colors hover:border-gold focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        }
      >
        {compact ? (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
            {active ? (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-tomato"
              />
            ) : null}
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-2" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="font-mono">{label(startDate)} &ndash; {label(endDate)}</span>
          </>
        )}
      </button>
      {open ? (
        <div ref={popRef} role="dialog" style={{ left: offsetLeft }} className="absolute z-30 mt-2 max-w-[calc(100vw-1rem)] overflow-auto rounded-md border border-line bg-surface shadow-lg">
          {monthRange ? (
            <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                From month
                <input
                  type="month"
                  value={monthOf(startDate)}
                  max={maxToday ? todayMonth : undefined}
                  onChange={(e) => setFromMonth(e.target.value)}
                  className="rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                To month
                <input
                  type="month"
                  value={monthOf(endDate)}
                  min={monthOf(startDate)}
                  max={maxToday ? todayMonth : undefined}
                  onChange={(e) => setToMonth(e.target.value)}
                  className="rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
                />
              </label>
            </div>
          ) : null}
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
          {footer ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-line p-3">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
