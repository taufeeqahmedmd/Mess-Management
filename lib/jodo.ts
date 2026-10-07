/**
 * Jodo payment gateway. Everything is per-branch and comes from the DB
 * (`payment_config`, resolved via `resolveJodoConfig`) — NOT env: a branch's
 * collector code, base URL, and credentials (API key/secret, or a pre-built
 * `auth_header` that overrides them). Each branch transacts against its own Jodo
 * account, and credentials never touch the client. `payment_config` is managed
 * directly in the DB; the UI only reads it.
 *
 *   resolveJodoConfig — load a branch's { base, auth, collectorCode }; null unless
 *                       collector code + url + usable credentials are all set.
 *   createJodoOrder   — POST an order, returns its id + hosted payment URL.
 *   getJodoOrder      — GET an order to confirm it was actually paid (docs:
 *                       https://docs.jodo.in/pay/api/get-order/). Crediting only
 *                       happens after this returns status "paid".
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

type JodoOrderInput = {
  name: string;
  phone: string;
  email: string;
  collectorCode: string;
  amount: number; // rupees, 2dp
  callbackUrl: string;
  /** Key/value metadata Jodo echoes back in every webhook for the order
   *  (docs: "for example ERP reference IDs") — we send our own order ref. */
  notes?: { key: string; value: string }[];
};

/** The `notes` key under which we send our payment_orders.client_uuid. */
export const JODO_NOTE_REF_KEY = "mess_ref";

/** One field-level validation error from Jodo's `errors: [{key, message}]`. */
export type JodoFieldError = { key: string; message: string };

export type JodoOrderResult =
  | { ok: true; orderId: string | null; paymentUrl: string | null; raw: unknown }
  | { ok: false; error: string; status?: number; raw?: unknown; fieldErrors?: JodoFieldError[] };

export type JodoOrderStatus =
  | { ok: true; paid: boolean; orderStatus: string | null; amount: number | null; transactionId: string | null; raw: unknown }
  | { ok: false; error: string; status?: number };

/** `auth` is the complete Authorization header value (e.g. "Basic <base64>"). */
export type JodoConfig = { base: string; auth: string; collectorCode: string };

type PaymentCredentials = {
  collectorCode?: string | null;
  url?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  authHeader?: string | null;
};

/**
 * The Authorization header value for a `payment_config` row. A DB-set
 * `auth_header` wins and is sent verbatim — a bare token (no scheme) gets a
 * "Basic " prefix so both paste styles work. Otherwise the header is computed
 * as Basic base64(api_key:api_secret). Null when neither is usable.
 */
export function resolveAuthHeader(c: PaymentCredentials): string | null {
  const h = c.authHeader?.trim();
  if (h) return h.includes(" ") ? h : `Basic ${h}`;
  if (c.apiKey && c.apiSecret) return `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64")}`;
  return null;
}

/** True when a row has everything needed to transact: collector code + URL +
 *  a resolvable Authorization header (auth_header OR api key + secret). */
export function isPaymentConfigComplete(c: PaymentCredentials | null | undefined): boolean {
  return Boolean(c && c.collectorCode && c.url && resolveAuthHeader(c));
}

/**
 * Resolve a branch's payment config from `payment_config`. Every field is
 * per-branch with NO env fallback: collector code + base URL + credentials
 * (an `auth_header`, or API key + secret to build one) must ALL be set for the
 * branch to transact. Returns null otherwise (the caller surfaces "not set up
 * for your branch").
 */
export async function resolveJodoConfig(branchId: bigint): Promise<JodoConfig | null> {
  const c = await prisma.paymentConfig.findUnique({ where: { branchId } });
  if (!c || !c.collectorCode || !c.url) return null;
  const auth = resolveAuthHeader(c);
  if (!auth) return null;
  return { base: c.url.replace(/\/$/, ""), auth, collectorCode: c.collectorCode };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Extract Jodo's `errors: [{key, message}]` list from an error body, if any. */
export function pickFieldErrors(raw: unknown): JodoFieldError[] {
  const errs = obj(raw).errors;
  if (!Array.isArray(errs)) return [];
  return errs
    .map((e) => obj(e))
    .filter((e) => typeof e.key === "string" && e.key)
    .map((e) => ({ key: String(e.key), message: typeof e.message === "string" ? e.message : "is invalid" }));
}

/**
 * Turn a Jodo error body into a message that says *what* was wrong. Jodo's
 * top-level `message` is just "Invalid payload!" — on its own it sent payers
 * straight back to the Pay button, so the field list (when present) is what
 * gets surfaced: "Payment gateway rejected: email (value is not a valid email
 * address)."
 */
export function describeJodoError(raw: unknown, status: number): { error: string; fieldErrors: JodoFieldError[] } {
  const r = obj(raw);
  const fieldErrors = pickFieldErrors(raw);
  if (fieldErrors.length) {
    return { error: `Payment gateway rejected: ${fieldErrors.map((e) => `${e.key} (${e.message})`).join("; ")}.`, fieldErrors };
  }
  if (status === 401 || status === 403) {
    return { error: "Payment gateway rejected our credentials. Please contact the mess office.", fieldErrors };
  }
  return { error: String(r.message || r.error || `Payment gateway error (${status}).`), fieldErrors };
}

function pickPaymentUrl(raw: unknown): string | null {
  const r = obj(raw);
  const data = obj(r.data);
  for (const src of [r, data]) {
    for (const key of ["redirect_url", "payment_url", "short_url", "url", "link", "payment_link"]) {
      const v = src[key];
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  return null;
}

function pickOrderId(raw: unknown): string | null {
  const data = obj(obj(raw).data);
  for (const key of ["order_id", "id"]) {
    const v = data[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export async function createJodoOrder(cfg: JodoConfig, input: JodoOrderInput): Promise<JodoOrderResult> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/pay/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cfg.auth },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        email: input.email,
        collector_code: input.collectorCode,
        details: [{ component_type: "Payable Amount", amount: input.amount }],
        callback_url: input.callbackUrl,
        ...(input.notes?.length ? { notes: input.notes } : {}),
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway. Please try again." };
  }

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, fieldErrors } = describeJodoError(raw, res.status);
    return { ok: false, error, status: res.status, raw, fieldErrors };
  }

  return { ok: true, orderId: pickOrderId(raw), paymentUrl: pickPaymentUrl(raw), raw };
}

/** Confirm an order's payment state. `paid` is true only when Jodo reports status "paid". */
export async function getJodoOrder(cfg: JodoConfig, orderId: string): Promise<JodoOrderStatus> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/pay/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: { Authorization: cfg.auth },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway." };
  }

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const r = obj(raw);
    return { ok: false, error: String(r.message || r.error || `Payment gateway error (${res.status}).`), status: res.status };
  }

  const data = obj(obj(raw).data);
  const details = Array.isArray(data.details) ? (data.details as Array<Record<string, unknown>>) : [];
  const amount = details.reduce((s, d) => s + (typeof d.amount === "number" ? d.amount : Number(d.amount) || 0), 0);
  return {
    ok: true,
    paid: data.status === "paid",
    orderStatus: typeof data.status === "string" ? data.status : null,
    amount: details.length ? amount : null,
    transactionId: typeof data.transaction_id === "string" ? data.transaction_id : null,
    raw,
  };
}

/** Wait `ms` — the pacing primitive for gateway calls. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- webhooks

/**
 * Jodo's documented production webhook source IPs
 * (docs.jodo.in/webhooks/security). Overridable via JODO_WEBHOOK_IP_ALLOWLIST
 * (comma-separated; "any" disables the check — signature verification still
 * applies) so an IP change on Jodo's side is a config edit, not a deploy.
 */
export const JODO_WEBHOOK_PRODUCTION_IPS = ["3.6.234.242", "3.111.80.40", "13.232.24.175", "43.204.202.190"];

/** Webhook event codes for checkout (Pay Order) payments. */
export const JODO_EVENT_DEBITED = "order.payment.debited";
export const JODO_EVENT_SETTLED = "order.payment.settled";

/**
 * Compute the `X-Jodo-Signature` value for a raw body: hex HMAC-SHA256 with the
 * subscription's shared secret (docs.jodo.in/webhooks/security).
 */
export function jodoSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time check of a received `X-Jodo-Signature` against the raw body. */
export function verifyJodoSignature(secret: string, rawBody: string, received: string | null | undefined): boolean {
  if (!secret || !received) return false;
  const expected = Buffer.from(jodoSignature(secret, rawBody), "utf8");
  const got = Buffer.from(received.trim().toLowerCase(), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export type JodoWebhook = { id: string; eventCode: string; url: string; failureEmail: string | null };

function toWebhook(v: unknown): JodoWebhook | null {
  const w = obj(v);
  if (typeof w.id !== "string" || typeof w.event_code !== "string") return null;
  return {
    id: w.id,
    eventCode: w.event_code,
    url: typeof w.url === "string" ? w.url : "",
    failureEmail: typeof w.failure_notification_email === "string" ? w.failure_notification_email : null,
  };
}

/** Register a webhook subscription (docs.jodo.in/configuration/api/add-webhook). */
export async function addJodoWebhook(
  cfg: JodoConfig,
  input: { eventCode: string; url: string; secretKey: string; failureEmail: string },
): Promise<{ ok: true; webhook: JodoWebhook } | { ok: false; error: string; status?: number }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/erp/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cfg.auth },
      body: JSON.stringify({
        // Required by the live API (not in the docs' field list): subscriptions
        // are scoped to the collector the branch transacts under.
        collector_code: cfg.collectorCode,
        event_code: input.eventCode,
        url: input.url,
        secret_key: input.secretKey,
        failure_notification_email: input.failureEmail,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway." };
  }
  const raw = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: describeJodoError(raw, res.status).error, status: res.status };
  const webhook = toWebhook(obj(raw).data);
  if (!webhook) return { ok: false, error: "Gateway returned no webhook id." };
  return { ok: true, webhook };
}

/** List the account's webhook subscriptions (docs.jodo.in/configuration/api/list-webhooks). */
export async function listJodoWebhooks(cfg: JodoConfig): Promise<{ ok: true; webhooks: JodoWebhook[]; raw: unknown } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/erp/webhooks`, { headers: { Authorization: cfg.auth }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway." };
  }
  const raw = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: describeJodoError(raw, res.status).error };
  const data = obj(raw).data;
  const webhooks = Array.isArray(data) ? data.map(toWebhook).filter((w): w is JodoWebhook => w !== null) : [];
  return { ok: true, webhooks, raw };
}

/** Disable a webhook subscription (docs.jodo.in/configuration/api/disable-webhook). */
export async function disableJodoWebhook(cfg: JodoConfig, webhookId: string): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/erp/webhooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
      headers: { Authorization: cfg.auth },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway." };
  }
  if (res.ok) return { ok: true };
  const raw = await res.json().catch(() => null);
  return { ok: false, error: describeJodoError(raw, res.status).error };
}
