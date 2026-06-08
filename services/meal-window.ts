export type MealWindow = { id: string; name: string; startTime: string; endTime: string };

/** "HH:MM" → minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight for a Date (local time). */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The active meal for a given time-of-day (minutes since midnight). Windows are
 * [start, end) and overnight-aware: when start > end the window wraps past
 * midnight (e.g. 22:00–02:00). Returns the first matching meal by input order,
 * or null when no window is open.
 */
export function activeMealNow(meals: MealWindow[], nowMinutes: number): MealWindow | null {
  for (const meal of meals) {
    const start = toMinutes(meal.startTime);
    const end = toMinutes(meal.endTime);
    const active =
      start <= end
        ? nowMinutes >= start && nowMinutes < end
        : nowMinutes >= start || nowMinutes < end; // overnight wrap
    if (active) return meal;
  }
  return null;
}
