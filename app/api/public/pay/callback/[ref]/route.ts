import { settlePayCallback } from "@/lib/pay-callback";

/**
 * GET /api/public/pay/callback/[ref] — where Jodo redirects the payer after
 * checkout. `ref` is our order reference (payment_orders.client_uuid), set in
 * the callback_url when the order was created — see lib/pay-callback.ts.
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return settlePayCallback(req, ref);
}
