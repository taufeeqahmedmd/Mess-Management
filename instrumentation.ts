/**
 * Next.js instrumentation — runs once at server startup, before any request is
 * handled. We pin the Node process timezone to the cafeteria's zone
 * (`APP_TIMEZONE`, default Asia/Kolkata / IST) so every *server-local* Date,
 * `toLocaleString`, and report day-bucket renders in IST regardless of where the
 * app is deployed (a Node server otherwise typically runs in UTC).
 *
 * This does NOT affect the consumption engine or the `lib/time` helpers — those
 * are already timezone-explicit (they pass the zone to `Intl`) and stay correct
 * on any host. This only fixes the ad-hoc server-local date code (reports, admin
 * "today", timestamp display) in one place.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
  }
}
