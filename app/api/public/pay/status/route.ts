import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicPayStatus = { status: "pending" | "credited" | "failed" };

/**
 * GET /api/public/pay/status?ref=<client_uuid> — what the return page polls
 * while waiting for Jodo's webhook. Reads ONLY our payment_orders row (never
 * the gateway), so polling costs Jodo nothing and the payer sees "credited"
 * the moment the webhook lands. The ref is an unguessable UUID; the response
 * carries no PII and nothing about non-existent refs beyond a generic 404.
 */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!UUID.test(ref)) return NextResponse.json({ error: "Invalid reference." }, { status: 400 });

  // Per-ref budget covers one payer polling every 2s for a minute with headroom;
  // the per-IP budget is coarse because a whole campus can share one NAT IP.
  const perRef = rateLimit(`pub-pay-status:${ref.toLowerCase()}`, 90, 60_000);
  const perIp = rateLimit(`pub-pay-status-ip:${clientIp(req.headers)}`, 600, 60_000);
  if (!perRef.ok || !perIp.ok) {
    const retry = Math.max(perRef.retryAfterSec, perIp.retryAfterSec);
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retry) } });
  }

  const order = await prisma.paymentOrder.findUnique({ where: { clientUuid: ref }, select: { status: true } });
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const status: PublicPayStatus["status"] =
    order.status === "credited" ? "credited" : order.status === "failed" ? "failed" : "pending";
  return NextResponse.json({ status } satisfies PublicPayStatus, { headers: { "Cache-Control": "no-store" } });
}
