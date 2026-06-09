"use client";

/**
 * Shared reporting date-range filter. Native GET form (so server components read
 * `from`/`to` from searchParams) with the themed react-date-range popup driving
 * two hidden inputs. `hidden` re-emits other query params (meal/counter filters)
 * so applying a range doesn't drop them. Used by the dashboard, vendor
 * dashboard, and reports.
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
}: {
  action: string;
  fromStr: string;
  toStr: string;
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
  maxToday?: boolean;
}) {
  const [from, setFrom] = useState(fromStr);
  const [to, setTo] = useState(toStr);

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        Date range
        <DateRangePicker
          from={from}
          to={to}
          maxToday={maxToday}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </label>
      {children}
      <button
        type="submit"
        className="rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep"
      >
        Apply
      </button>
    </form>
  );
}
