import Link from "next/link";

export type MealRow = { id: string; name: string; code: string; defaultStart: string; defaultEnd: string };
export type Assignment = { startTime: string; endTime: string };

const timeInput =
  "rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/**
 * Presentational meal × service-window rows for the Counters page. Uncontrolled:
 * emits `meal_<id>` (checkbox), `start_<id>` / `end_<id>` (HH:MM) fields the
 * counter create/assign actions parse. Each row shows the meal's default window;
 * a per-counter time outside it is clamped into the default on save. `assignments`
 * pre-checks + pre-fills the counter's existing windows.
 */
export function CounterMealRows({
  meals,
  assignments = {},
}: {
  meals: MealRow[];
  assignments?: Record<string, Assignment>;
}) {
  if (meals.length === 0) {
    return (
      <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
        No active meals yet.{" "}
        <Link href="/settings/meals/new" className="font-semibold text-gold-deep hover:underline">
          Create a meal
        </Link>{" "}
        first, then assign it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {meals.map((m) => {
        const a = assignments[m.id];
        // Browser hint for the common non-overnight default; overnight windows
        // (start > end) skip min/max and rely on the server-side clamp.
        const bounded = m.defaultStart <= m.defaultEnd;
        const bound = bounded ? { min: m.defaultStart, max: m.defaultEnd } : {};
        return (
          <div
            key={m.id}
            className="flex flex-col gap-3 rounded-sm border border-line bg-surface p-3 has-[:checked]:border-gold sm:flex-row sm:items-center sm:gap-4"
          >
            <label className="flex flex-1 items-center gap-3 text-sm">
              <input type="checkbox" name={`meal_${m.id}`} defaultChecked={Boolean(a)} className="size-4 shrink-0 accent-gold" />
              <span className="font-medium text-ink">{m.name}</span>
              <span className="font-mono text-xs text-muted">{m.code}</span>
              <span className="ml-auto rounded-pill bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">
                Default {m.defaultStart}&ndash;{m.defaultEnd}
              </span>
            </label>

            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">From</span>
              <input type="time" name={`start_${m.id}`} defaultValue={a?.startTime ?? m.defaultStart} {...bound} aria-label={`${m.name} start time`} className={timeInput} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">To</span>
              <input type="time" name={`end_${m.id}`} defaultValue={a?.endTime ?? m.defaultEnd} {...bound} aria-label={`${m.name} end time`} className={timeInput} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
