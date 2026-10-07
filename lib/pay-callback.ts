import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The payer's return from Jodo checkout. This is a *navigation* signal only
 * (Jodo: "It should not be the only source of truth for payment completion") —
 * confirmation comes from Jodo's signed webhook, so this never calls Jodo and
 * never credits. It just locates the order and bounces the payer to /top-up,
 * which polls OUR order status until the webhook has landed.
 *
 * `ref` is our order reference (payment_orders.client_uuid) from the callback
 * URL path. Orders created before the ref existed fall back to Jodo's
 * `order` / `order_id` / `id` query params.
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
  // The page confirms via /api/public/pay/status?ref=… (already-credited orders
  // resolve on the first poll).
  return back({ ref: record.clientUuid, code });
}
