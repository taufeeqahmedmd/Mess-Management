import { createHash, randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a client-supplied idempotency token (a UUID generated once per form
 * render) from a FormData field, falling back to a fresh UUID when absent or
 * malformed. Reusing the token on a double-submit collides with the UNIQUE
 * `client_uuid` constraint, turning the replay into a safe no-op (database.md).
 */
export function readClientUuid(formData: FormData, field = "clientTxId"): string {
  const raw = String(formData.get(field) ?? "").trim();
  return UUID_RE.test(raw) ? raw : randomUUID();
}

/**
 * A deterministic UUID (RFC-4122 v5-style, SHA-1) derived from a stable seed.
 * Used for CSV imports so re-uploading the identical file is a no-op rather than
 * a double credit: the same row → the same `client_uuid` → UNIQUE collision.
 */
export function deterministicUuid(seed: string): string {
  const h = createHash("sha1").update(seed).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
