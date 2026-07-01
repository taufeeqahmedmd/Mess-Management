/**
 * Branch-local time helpers (database.md "active meal now"; CLAUDE.md money rules).
 *
 * The consumption engine evaluates meal windows, the once-per-session bucket, and
 * date-versioned rate/validity against the cafeteria's *local* calendar — never
 * the deploy server's clock. A Next.js server typically runs in UTC, so deriving
 * "today" from `Date#getHours()` (local) while comparing against UTC-midnight
 * dates produces a timezone split-brain near meal boundaries and around midnight.
 *
 * All three notions are derived from one source — `APP_TIMEZONE` (IANA) — so they
 * can never disagree:
 *   - `minutesOfDayInZone` — minutes since local midnight (meal-window matching).
 *   - `localDateValue`     — the local calendar date as a UTC-midnight Date, to
 *                            compare against `@db.Date` columns (valid_from/till,
 *                            card_expiry_date) which Postgres stores at UTC midnight.
 *   - `localDayRange`      — the [start, end) instants covering the local day, to
 *                            filter `timestamptz` columns (redeemed_at).
 *
 * India observes no DST, so a single offset per instant is exact for the target
 * deployment; the offset is recomputed per call, so other (non-DST-transitioning)
 * zones work too.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
};

function zonedParts(d: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number.parseInt(map.hour ?? "0", 10);
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  return {
    year: Number.parseInt(map.year ?? "1970", 10),
    month: Number.parseInt(map.month ?? "1", 10),
    day: Number.parseInt(map.day ?? "1", 10),
    hour,
    minute: Number.parseInt(map.minute ?? "0", 10),
  };
}

/** Minutes since local midnight in the app timezone. */
export function minutesOfDayInZone(d: Date, tz: string = APP_TIMEZONE): number {
  const p = zonedParts(d, tz);
  return p.hour * 60 + p.minute;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The calendar date of `d` in the app timezone as `YYYY-MM-DD`. Use this for
 * *display* of any date — unlike `Date#toISOString()` (which is always UTC and
 * so renders IST timestamps 5:30 behind), this reads the wall-clock in `tz`.
 */
export function formatDateInZone(d: Date, tz: string = APP_TIMEZONE): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * `d` in the app timezone as `YYYY-MM-DD HH:mm` (minute precision). The display
 * counterpart of `formatDateInZone` for `timestamptz` values (redeemed_at,
 * recharged_at, audit created_at, …) so the operator always sees IST wall-clock.
 */
export function formatDateTimeInZone(d: Date, tz: string = APP_TIMEZONE): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * The local calendar date (in `tz`) as a Date at UTC midnight. Use this to compare
 * against `@db.Date` columns, which Postgres returns as UTC-midnight Dates.
 */
export function localDateValue(d: Date, tz: string = APP_TIMEZONE): Date {
  const p = zonedParts(d, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/**
 * The [start, end) instant range covering the local calendar day that contains
 * `d`. Use this to filter `timestamptz` columns (e.g. redeemed_at) by "today".
 */
export function localDayRange(d: Date, tz: string = APP_TIMEZONE): { start: Date; end: Date } {
  const p = zonedParts(d, tz);
  // Offset (ms) between the local wall-clock and UTC at this instant:
  // wallclock-as-UTC minus the real instant.
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Round the real instant to the minute to match the minute-resolution parts.
  const realMinute = Math.floor(d.getTime() / 60000) * 60000;
  const offsetMs = wallAsUtc - realMinute;
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  const start = new Date(localMidnightAsUtc - offsetMs);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}
