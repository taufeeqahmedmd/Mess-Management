import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { tapEngine } from "@/services/consumption";

const schema = z.object({
  cardUid: z.string().trim().min(1).max(64),
  counterId: z.string(),
  clientTxId: z.string().uuid(),
});

/** POST /api/counter/tap — run the consumption engine for one tap. Idempotent on clientTxId. */
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

  // The operator must be assigned to this active counter (and in scope).
  const counter = await prisma.counter.findFirst({
    where: { id: counterId, status: "active", operators: { some: { appUserId: BigInt(actor.id) } } },
  });
  if (!counter) {
    return NextResponse.json({ error: "You are not assigned to this counter." }, { status: 403 });
  }
  if (actor.branchId && counter.branchId.toString() !== actor.branchId) {
    return NextResponse.json({ error: "Counter is out of your branch." }, { status: 403 });
  }

  const result = await prisma.$transaction((tx) =>
    tapEngine(tx, {
      cardUid: parsed.data.cardUid,
      counterId,
      clientUuid: parsed.data.clientTxId,
      operatorId: BigInt(actor.id),
      at: new Date(),
    }),
  );

  if (result.status === "APPROVED" && result.redemptionId) {
    await writeAudit({
      appUserId: BigInt(actor.id),
      action: "tap.approve",
      entity: "redemption",
      entityId: BigInt(result.redemptionId),
      after: { paidBy: result.paidBy, charged: result.charged, meal: result.meal?.name, counterId: counterId.toString() },
    });
  }

  return NextResponse.json(result);
}
