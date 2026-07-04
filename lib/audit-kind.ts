/**
 * Audit-action classification. The `audit_log` table stores a free-form
 * `action` string (e.g. "recharge.reverse", "password.change"); the reports UI
 * groups these into a small `kind` for filtering, KPIs, and chart colours.
 * Order matters — security wins over everything, then delete, create, update.
 */
export type AuditKind = "create" | "update" | "delete" | "reject" | "security" | "other";

export function auditKind(action: string): AuditKind {
  const a = action.toLowerCase();
  if (/login|logout|password|auth|sign[\s_-]?in/.test(a)) return "security";
  // A rejected/blocked tap is a distinct kind — it must be tested BEFORE the
  // `delete` rule because "tap.block" also matches /block/.
  if (/tap\.(reject|block)|reject|declin/.test(a)) return "reject";
  if (/revers|delete|remove|block|deactiv|suspend|expire|expiry|void|retire|lost|disable/.test(a)) return "delete";
  if (/create|\.add|issue|\.new|import/.test(a)) return "create";
  if (/update|edit|change|replace|activ|approve|generate|set/.test(a)) return "update";
  return "other";
}

export const AUDIT_KINDS: AuditKind[] = ["create", "update", "delete", "reject", "security", "other"];

export const AUDIT_KIND_META: Record<AuditKind, { label: string; dot: string; text: string; fill: string }> = {
  create: { label: "Create", dot: "bg-sage", text: "text-sage-deep", fill: "var(--sage)" },
  update: { label: "Update", dot: "bg-gold", text: "text-gold-deep", fill: "var(--gold)" },
  delete: { label: "Delete / reverse", dot: "bg-tomato", text: "text-tomato", fill: "var(--tomato)" },
  reject: { label: "Tap rejected", dot: "bg-terracotta", text: "text-terracotta", fill: "var(--terracotta)" },
  security: { label: "Security", dot: "bg-navy", text: "text-navy-text", fill: "var(--navy)" },
  other: { label: "Other", dot: "bg-muted-2", text: "text-muted", fill: "var(--muted-2)" },
};
