/**
 * Jodo payment gateway. Everything is per-branch and comes from the DB
 * (`payment_config`, resolved via `resolveJodoConfig`) — NOT env: a branch's
 * collector code, base URL, and API key/secret. Each branch transacts against its
 * own Jodo account, and credentials never touch the client. `payment_config` is
 * managed directly in the DB; the UI only reads it.
 *
 *   resolveJodoConfig — load a branch's { base, auth, collectorCode }; null unless
 *                       ALL of collector code + url + key + secret are set.
 *   createJodoOrder   — POST an order, returns its id + hosted payment URL.
 *   getJodoOrder      — GET an order to confirm it was actually paid (docs:
 *                       https://docs.jodo.in/pay/api/get-order/). Crediting only
 *                       happens after this returns status "paid".
 */

import { prisma } from "@/lib/prisma";

type JodoOrderInput = {
  name: string;
  phone: string;
  email: string;
  collectorCode: string;
  amount: number; // rupees, 2dp
  callbackUrl: string;
};

export type JodoOrderResult =
  | { ok: true; orderId: string | null; paymentUrl: string | null; raw: unknown }
  | { ok: false; error: string; status?: number; raw?: unknown };

export type JodoOrderStatus =
  | { ok: true; paid: boolean; orderStatus: string | null; amount: number | null; transactionId: string | null; raw: unknown }
  | { ok: false; error: string; status?: number };

export type JodoConfig = { base: string; auth: string; collectorCode: string };

/**
 * Resolve a branch's payment config from `payment_config`. Every field is
 * per-branch with NO env fallback: collector code + base URL + API key + API
 * secret must ALL be set for the branch to transact. Returns null otherwise (the
 * caller surfaces "not set up for your branch"). The Basic auth header is
 * base64(api_key:api_secret).
 */
export async function resolveJodoConfig(branchId: bigint): Promise<JodoConfig | null> {
  const c = await prisma.paymentConfig.findUnique({ where: { branchId } });
  if (!c || !c.collectorCode || !c.url || !c.apiKey || !c.apiSecret) return null;
  return {
    base: c.url.replace(/\/$/, ""),
    auth: Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64"),
    collectorCode: c.collectorCode,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
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
      headers: { "Content-Type": "application/json", Authorization: `Basic ${cfg.auth}` },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        email: input.email,
        collector_code: input.collectorCode,
        details: [{ component_type: "Payable Amount", amount: input.amount }],
        callback_url: input.callbackUrl,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach the payment gateway. Please try again." };
  }

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const r = obj(raw);
    return { ok: false, error: String(r.message || r.error || `Payment gateway error (${res.status}).`), status: res.status, raw };
  }

  return { ok: true, orderId: pickOrderId(raw), paymentUrl: pickPaymentUrl(raw), raw };
}

/** Confirm an order's payment state. `paid` is true only when Jodo reports status "paid". */
export async function getJodoOrder(cfg: JodoConfig, orderId: string): Promise<JodoOrderStatus> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/v1/integrations/pay/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: { Authorization: `Basic ${cfg.auth}` },
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
