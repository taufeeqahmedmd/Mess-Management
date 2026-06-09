import Link from "next/link";

export type CounterRow = { id: string; name: string; code: string; branch: string };
export type Assignment = { startTime: string; endTime: string };

const timeInput =
  "rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/**
 * Presentational counter × service-window rows, shared by the meal edit
 * ("Counters & service windows") and new-meal forms. Uncontrolled: emits
 * `counter_<id>` (checkbox), `start_<id>` / `end_<id>` (HH:MM) fields the meal
 * create/assign actions parse. `assignments` pre-checks + pre-fills existing rows.
 */
export function CounterWindowRows({
  counters,
  assignments = {},
  defaultStart,
  defaultEnd,
}: {
  counters: CounterRow[];
  assignments?: Record<string, Assignment>;
  defaultStart: string;
  defaultEnd: string;
}) {
  if (counters.length === 0) {
    return (
      <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
        No active counters yet.{" "}
        <Link href="/settings/counters/new" className="font-semibold text-gold-deep hover:underline">
          Create a counter
        </Link>{" "}
        first, then assign it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {counters.map((c) => {
        const a = assignments[c.id];
        return (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-sm border border-line bg-surface p-3 has-[:checked]:border-gold sm:flex-row sm:items-center sm:gap-4"
          >
            <label className="flex flex-1 items-center gap-3 text-sm">
              <input type="checkbox" name={`counter_${c.id}`} defaultChecked={Boolean(a)} className="size-4 shrink-0 accent-gold" />
              <span className="font-medium text-ink">{c.name}</span>
              <span className="font-mono text-xs text-muted">{c.code}</span>
              <span className="ml-auto rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{c.branch}</span>
            </label>

            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">From</span>
              <input type="time" name={`start_${c.id}`} defaultValue={a?.startTime ?? defaultStart} aria-label={`${c.name} start time`} className={timeInput} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">To</span>
              <input type="time" name={`end_${c.id}`} defaultValue={a?.endTime ?? defaultEnd} aria-label={`${c.name} end time`} className={timeInput} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
