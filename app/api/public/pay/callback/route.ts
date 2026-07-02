import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getJodoOrder } from "@/lib/jodo";
import { creditPaymentOrder } from "@/lib/run-online-topup";

/**
 * GET /api/public/pay/callback — where Jodo redirects the payer after checkout.
 * We NEVER trust the redirect itself: we re-verify the order via get-order
 * (docs.jodo.in/pay/api/get-order) and only credit the coupons when Jodo reports
 * status "paid". Crediting is idempotent (order status + unique clientUuid), so a
 * refresh/replay can't double-credit. Then we bounce the user back to /top-up.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, "");
  const back = (params: Record<string, string>) => {
    const to = new URL(`${appUrl}/top-up`);
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    return NextResponse.redirect(to, { status: 303 });
  };

  const orderId =
    url.searchParams.get("order") ?? url.searchParams.get("order_id") ?? url.searchParams.get("id");
  if (!orderId) return back({ pay: "error" });

  const record = await prisma.paymentOrder.findUnique({ where: { jodoOrderId: orderId } });
  if (!record) return back({ pay: "error" });

  const code = (await prisma.user.findUnique({ where: { id: record.userId }, select: { code: true } }))?.code ?? "";

  // Already credited on a prior callback/refresh → just show success.
  if (record.status === "credited") return back({ paid: "1", code });

  const order = await getJodoOrder(orderId);
  if (!order.ok) return back({ pay: "pending", code });
  if (!order.paid) return back({ pay: "pending", code });

  const result = await creditPaymentOrder(record, order.transactionId);
  if (!result.ok) {
    console.error("Online top-up credit failed:", orderId, result.error);
    return back({ pay: "error", code });
  }
  return back({ paid: "1", code });
}
