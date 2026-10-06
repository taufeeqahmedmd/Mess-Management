import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getJodoOrderWithBackoff, resolveJodoConfig } from "@/lib/jodo";
import { creditPaymentOrder } from "@/lib/run-online-topup";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// If Jodo rate-limits (429) the payer's status check, retry after these waits
// (≤3s extra on the redirect) rather than strand a paid order as "pending".
const BACKOFF_MS = [1_000, 2_000];

/**
 * Settle a payer's return from Jodo checkout. `ref` is OUR order reference
 * (`payment_orders.client_uuid`) carried in the callback URL path — set when the
 * order is created, so finding the order never depends on whatever query params
 * Jodo does (or doesn't) append to the redirect. Orders created before the ref
 * was added fall back to Jodo's `order` / `order_id` / `id` params.
 *
 * We NEVER trust the redirect itself: we re-verify the order via get-order
 * (docs.jodo.in/pay/api/get-order) and only credit the coupons when Jodo reports
 * status "paid". Crediting is idempotent (order status + unique clientUuid), so a
 * refresh/replay can't double-credit. Then we bounce the user back to /top-up.
 */
export async function settlePayCallback(req: Request, ref: string | null): Promise<NextResponse> {
  const url = new URL(req.url);
  const appUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, "");
  const back = (params: Record<string, string>) => {
    const to = new URL(`${appUrl}/top-up`);
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    return NextResponse.redirect(to, { status: 303 });
  };

  const jodoOrderId =
    url.searchParams.get("order") ?? url.searchParams.get("order_id") ?? url.searchParams.get("id");

  let record = null;
  if (ref) {
    // Malformed ref → not found (an invalid uuid would make the Postgres query throw).
    if (UUID.test(ref)) record = await prisma.paymentOrder.findUnique({ where: { clientUuid: ref } });
  } else if (jodoOrderId) {
    record = await prisma.paymentOrder.findUnique({ where: { jodoOrderId } });
  }
  if (!record) {
    console.error("Jodo callback: no matching payment order", { ref, query: url.search });
    return back({ pay: "error" });
  }

  const code = (await prisma.user.findUnique({ where: { id: record.userId }, select: { code: true } }))?.code ?? "";

  // Already credited on a prior callback/refresh → just show success.
  if (record.status === "credited") return back({ paid: "1", code });

  const cfg = await resolveJodoConfig(record.branchId);
  if (!cfg) return back({ pay: "error", code });

  // Verify the order we stored, not an id taken from the (untrusted) redirect.
  const order = await getJodoOrderWithBackoff(cfg, record.jodoOrderId, BACKOFF_MS);
  if (!order.ok) {
    console.error("Jodo callback: get-order failed", record.jodoOrderId, order.status ?? "unreachable", order.error);
    return back({ pay: "pending", code });
  }
  if (!order.paid) return back({ pay: "pending", code });

  const result = await creditPaymentOrder(record, order.transactionId);
  if (!result.ok) {
    console.error("Online top-up credit failed:", record.jodoOrderId, result.error);
    return back({ pay: "error", code });
  }
  return back({ paid: "1", code });
}
