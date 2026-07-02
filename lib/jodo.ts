/**
 * Jodo payment gateway. Credentials come from env (JODO_USERNAME / JODO_PASSWORD,
 * HTTP Basic auth) and never touch the client. The `collector_code` identifies
 * the school/branch the payment is collected for, so a cardholder's payment
 * routes to their own branch's account.
 *
 *   createJodoOrder — POST an order, returns its id + hosted payment URL.
 *   getJodoOrder    — GET an order to confirm it was actually paid (docs:
 *                     https://docs.jodo.in/pay/api/get-order/). Crediting only
 *                     happens after this returns status "paid".
 */

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
  | { ok: true; paid: boolean; amount: number | null; transactionId: string | null; raw: unknown }
  | { ok: false; error: string; status?: number };

function jodoConfig(): { base: string; auth: string } | null {
  const base = process.env.JODO_BASE_URL;
  const user = process.env.JODO_USERNAME;
  const pass = process.env.JODO_PASSWORD;
  if (!base || !user || !pass) return null;
  return { base: base.replace(/\/$/, ""), auth: Buffer.from(`${user}:${pass}`).toString("base64") };
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

export async function createJodoOrder(input: JodoOrderInput): Promise<JodoOrderResult> {
  const cfg = jodoConfig();
  if (!cfg) return { ok: false, error: "Payment gateway is not configured." };

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
export async function getJodoOrder(orderId: string): Promise<JodoOrderStatus> {
  const cfg = jodoConfig();
  if (!cfg) return { ok: false, error: "Payment gateway is not configured." };

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
    amount: details.length ? amount : null,
    transactionId: typeof data.transaction_id === "string" ? data.transaction_id : null,
    raw,
  };
}
