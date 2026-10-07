import { NextResponse } from "next/server";
import { handleJodoWebhook } from "@/lib/payment-webhook";

/**
 * POST /api/public/pay/webhook — Jodo's webhook endpoint (order.payment.debited /
 * order.payment.settled). Unauthenticated by design: authenticity is the HMAC
 * `X-Jodo-Signature` over the RAW body (so the body is read as text, never
 * re-serialised) plus the source-IP allowlist. See lib/payment-webhook.ts for
 * the response discipline that keeps the subscription alive.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const result = await handleJodoWebhook(raw, req.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
