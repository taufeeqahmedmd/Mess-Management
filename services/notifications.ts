/**
 * Pure notification logic (no DB): recipient-config parsing and {{variable}}
 * template rendering. The DB dispatcher (lib/notifications/notify.ts) and the
 * config UI both consume these, so behaviour stays unit-testable.
 */

export type RecipientsConfig = {
  roles: string[];
  vendor: boolean;
  requester: boolean;
  cardholder: boolean;
};

/** Coerce the stored `recipients` JSON into a safe config (defaults on anything odd). */
export function parseRecipients(value: unknown): RecipientsConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    roles: Array.isArray(v.roles) ? v.roles.map(String).filter(Boolean) : [],
    vendor: v.vendor === true,
    requester: v.requester === true,
    cardholder: v.cardholder === true,
  };
}

/**
 * Render {{variable}} placeholders from the event's context. Unknown variables
 * render as empty (never leak the raw placeholder to a recipient). Whitespace
 * inside braces is tolerated ({{ name }}). Purely numeric placeholders
 * ({{1}},{{2}},…) are LEFT ALONE — those are WhatsApp positional params, filled
 * later from the ordered event values, not from named vars.
 */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/** Fallback body when a rule has no template: a readable key/value summary. */
export function fallbackBody(label: string, vars: Record<string, string>): string {
  const parts = Object.entries(vars)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `${label}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
}
