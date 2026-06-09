import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { runTap } from "@/lib/run-tap";

const schema = z.object({
  counterId: z.string(),
  taps: z
    .array(
      z.object({
        cardUid: z.string().trim().min(1).max(64),
        clientTxId: z.string().uuid(),
        at: z.string(),
      }),
    )
    .max(500),
});

/**
 * POST /api/counter/sync — bulk replay an offline tap queue. Each tap runs
 * through the engine at its ORIGINAL time, idempotent on clientTxId (a replayed
 * tap never double-charges). Returns a per-tap report; a tap QUEUED offline may
 * now reject (e.g. balance ran out) — surfaced honestly, not hidden.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "counter.operate")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  let counterId: bigint;
  try {
    counterId = BigInt(parsed.data.counterId);
  } catch {
    return NextResponse.json({ error: "Invalid counter." }, { status: 400 });
  }

  const counter = await prisma.counter.findFirst({
    where: { id: counterId, status: "active", operators: { some: { appUserId: BigInt(actor.id) } } },
  });
  if (!counter) return NextResponse.json({ error: "You are not assigned to this counter." }, { status: 403 });
  if (actor.branchId && counter.branchId.toString() !== actor.branchId) {
    return NextResponse.json({ error: "Counter is out of your branch." }, { status: 403 });
  }

  const results: Array<{
    clientTxId: string;
    status: string;
    reason: string;
    name?: string;
    charged?: string;
    meal?: string;
    // True when an optimistically-accepted offline tap did NOT apply on replay
    // (e.g. balance ran out) — the offline overspend the sync report must surface
    // honestly (database.md: "flag negative reconciliations, don't hide them").
    negativeReconciliation?: boolean;
  }> = [];

  for (const tap of parsed.data.taps) {
    const at = new Date(tap.at);
    // A queued tap without a valid original time can't be evaluated against the
    // right meal window / rate / session — reject it honestly rather than charge
    // it as if it happened now (which could apply the wrong meal's price).
    if (Number.isNaN(at.getTime())) {
      results.push({ clientTxId: tap.clientTxId, status: "REJECTED", reason: "BAD TIMESTAMP", negativeReconciliation: true });
      continue;
    }

    try {
      const result = await runTap(
        {
          cardUid: tap.cardUid,
          counterId,
          clientUuid: tap.clientTxId,
          operatorId: BigInt(actor.id),
          at,
          syncedAt: new Date(),
        },
        { appUserId: BigInt(actor.id), counterId },
      );

      results.push({
        clientTxId: tap.clientTxId,
        status: result.status,
        reason: result.reason,
        name: result.cardholder?.name,
        charged: result.charged,
        meal: result.meal?.name,
        // Anything other than APPROVED for a tap the operator already served is a
        // negative reconciliation.
        negativeReconciliation: result.status !== "APPROVED",
      });
    } catch {
      // One tap failing (e.g. exhausted retries / transient DB error) must not
      // abort the whole batch and rob the rest of their per-tap report. Report it
      // and move on; runTap is idempotent, so this tap can be retried on the next
      // sync without double-charging. Do NOT mark it negative — it's unresolved,
      // not a confirmed overspend, and it stays queued client-side.
      results.push({ clientTxId: tap.clientTxId, status: "ERROR", reason: "SYNC FAILED — will retry" });
    }
  }

  const summary = {
    total: results.length,
    approved: results.filter((r) => r.status === "APPROVED").length,
    rejected: results.filter((r) => r.status === "REJECTED").length,
    blocked: results.filter((r) => r.status === "BLOCKED").length,
    errored: results.filter((r) => r.status === "ERROR").length,
    negativeReconciliations: results.filter((r) => r.negativeReconciliation).length,
  };
  await writeAudit({
    appUserId: BigInt(actor.id),
    action: "counter.sync",
    entity: "counter",
    entityId: counterId,
    after: summary,
  });

  return NextResponse.json({ results, summary });
}
