import { settlePayCallback } from "@/lib/pay-callback";

/**
 * GET /api/public/pay/callback — legacy Jodo return URL (orders created before
 * the ref was put in the path). The order is located by Jodo's `order` /
 * `order_id` / `id` query param; new orders return via `callback/[ref]`.
 */
export async function GET(req: Request) {
  return settlePayCallback(req, null);
}
