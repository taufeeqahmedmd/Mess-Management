/**
 * Shared reporting date-range filter (server component — native GET form, no
 * client JS). `hidden` re-emits other query params (meal/counter filters, etc.)
 * so applying a range doesn't drop them. Used by the dashboard, vendor
 * dashboard, and reports.
 */
export function DateRangeForm({
  action,
  fromStr,
  toStr,
  hidden = {},
  children,
}: {
  action: string;
  fromStr: string;
  toStr: string;
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  const field =
    "rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        From
        <input type="date" name="from" defaultValue={fromStr} max={toStr} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        To
        <input type="date" name="to" defaultValue={toStr} className={field} />
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
