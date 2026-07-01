import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import {
  fulfillFoodRequest,
  isRetryableFulfillError,
  type FulfillParams,
  type FulfillResult,
} from "@/services/food-request-fulfillment";

const MAX_RETRIES = 4;

/**
 * Run one food-request delivery through the fulfilment engine inside a single
 * `$transaction`, writing the delivery audit row in the SAME transaction. Retries
 * the whole transaction on an optimistic-lock conflict / write-conflict, so the
 * contract — "a re-tapped delivery returns the original result, never double-
 * charges" — holds under concurrency.
 */
export async function runFulfillment(
  params: FulfillParams,
  audit: { appUserId: bigint },
): Promise<FulfillResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const result = await fulfillFoodRequest(tx, params);
        if (result.status === "DELIVERED" && result.requestId) {
          await writeAudit(
            {
              appUserId: audit.appUserId,
              action: "foodRequest.deliver",
              entity: "food_request",
              entityId: BigInt(result.requestId),
              after: { charged: result.charged, cardUid: params.cardUid },
            },
            tx,
          );
        }
        return result;
      });
    } catch (e) {
      if (isRetryableFulfillError(e) && attempt < MAX_RETRIES) continue;
      throw e;
    }
  }
}
