"use client";

/**
 * Shared reporting date-range filter. Native GET form (so server components read
 * `from`/`to` from searchParams) collapsed behind a single filter icon: the
 * calendar, any extra filter controls (`children`, e.g. meal/counter selects)
 * and the Apply button all live inside the picker popover. `hidden` re-emits
 * other query params so applying a range doesn't drop them. A red dot on the
 * icon flags an applied filter. Used by the dashboard, vendor dashboard, reports.
 */

import { useState } from "react";
import { DateRangePicker } from "@/components/ui/date-range-picker";

export function DateRangeForm({
  action,
  fromStr,
  toStr,
  hidden = {},
  children,
  maxToday = false,
  active = false,
}: {
  action: string;
  fromStr: string;
  toStr: string;
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
  maxToday?: boolean;
  /** Flag that a non-default range is applied (drives the filter-icon red dot). */
  active?: boolean;
}) {
  const [from, setFrom] = useState(fromStr);
  const [to, setTo] = useState(toStr);

  return (
    <form method="get" action={action}>
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <DateRangePicker
        from={from}
        to={to}
        maxToday={maxToday}
        compact
        monthRange
        active={active}
        onChange={(f, t) => {
          setFrom(f);
          setTo(t);
        }}
        footer={
          <>
            {children}
            <button
              type="submit"
              className="rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-white shadow-gold transition-colors hover:bg-gold-deep"
            >
              Apply
            </button>
          </>
        }
      />
    </form>
  );
}
