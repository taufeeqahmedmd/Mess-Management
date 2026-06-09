import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import {
  tapEngine,
  isRetryableTapError,
  type TapParams,
  type TapResult,
} from "@/services/consumption";

const MAX_RETRIES = 4;

/**
 * Run one tap through the consumption engine inside a single `$transaction`,
 * writing the approval audit row in the SAME transaction (api.md). Retries the
 * whole transaction on an optimistic-lock conflict / write-conflict / duplicate
 * `client_uuid` (a concurrent replay), so the contract — "a replayed tap returns
 * the original result, never charges twice" — holds even under concurrency.
 */
export async function runTap(
  params: TapParams,
  audit: { appUserId: bigint; counterId: bigint },
): Promise<TapResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const result = await tapEngine(tx, params);
        if (result.status === "APPROVED" && result.redemptionId) {
          await writeAudit(
            {
              appUserId: audit.appUserId,
              action: "tap.approve",
              entity: "redemption",
              entityId: BigInt(result.redemptionId),
              after: {
                paidBy: result.paidBy,
                charged: result.charged,
                meal: result.meal?.name,
                counterId: audit.counterId.toString(),
                synced: Boolean(params.syncedAt),
              },
            },
            tx,
          );
        }
        return result;
      });
    } catch (e) {
      if (isRetryableTapError(e) && attempt < MAX_RETRIES) continue;
      throw e;
    }
  }
}
