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
 * inside braces is tolerated ({{ name }}).
 */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Resolve the ordered WhatsApp variable values for an approved Business template:
 * `waVariables` is a JSON array of event-variable names filling {{1}},{{2}},… in
 * the approved template. Missing values become empty strings (Smartping rejects
 * missing params otherwise).
 */
export function waVariableValues(waVariables: unknown, vars: Record<string, string>): string[] {
  if (!Array.isArray(waVariables)) return [];
  return waVariables.map((name) => vars[String(name)] ?? "");
}

/** Fallback body when a rule has no template: a readable key/value summary. */
export function fallbackBody(label: string, vars: Record<string, string>): string {
  const parts = Object.entries(vars)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `${label}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
}
