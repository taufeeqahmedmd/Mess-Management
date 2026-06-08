import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { tapEngine } from "@/services/consumption";

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
  }> = [];

  for (const tap of parsed.data.taps) {
    const parsedAt = new Date(tap.at);
    const at = Number.isNaN(parsedAt.getTime()) ? new Date() : parsedAt;

    const result = await prisma.$transaction((tx) =>
      tapEngine(tx, {
        cardUid: tap.cardUid,
        counterId,
        clientUuid: tap.clientTxId,
        operatorId: BigInt(actor.id),
        at,
      }),
    );

    if (result.status === "APPROVED" && result.redemptionId) {
      await prisma.redemption
        .update({ where: { id: BigInt(result.redemptionId) }, data: { syncedAt: new Date() } })
        .catch(() => {});
    }

    results.push({
      clientTxId: tap.clientTxId,
      status: result.status,
      reason: result.reason,
      name: result.cardholder?.name,
      charged: result.charged,
      meal: result.meal?.name,
    });
  }

  const summary = {
    total: results.length,
    approved: results.filter((r) => r.status === "APPROVED").length,
    rejected: results.filter((r) => r.status === "REJECTED").length,
    blocked: results.filter((r) => r.status === "BLOCKED").length,
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
