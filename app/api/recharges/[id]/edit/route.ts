import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { defaultRatesForCategory } from "@/services/pricing";
import { todayValue } from "@/lib/time";

/**
 * GET /api/recharges/[id]/edit — data for the slide-in edit drawer: the meals
 * with the cardholder's category rates, current per-meal coupon counts, payment
 * modes, and the recharge's mode/validity/remarks. RBAC + branch-scoped; only
 * `posted` recharges are editable (409 otherwise).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "recharge.edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let rechargeId: bigint;
  try {
    rechargeId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recharge = await prisma.recharge.findUnique({
    where: { id: rechargeId },
    include: { user: true, coupons: true },
  });
  if (!recharge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.branchId && recharge.user.branchId.toString() !== actor.branchId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (recharge.status !== "posted")
    return NextResponse.json({ error: `This recharge is ${recharge.status} and can no longer be edited.` }, { status: 409 });

  const [meals, paymentModes, rates] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.paymentMode.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    defaultRatesForCategory(prisma, {
      branchId: recharge.user.branchId,
      categoryId: recharge.user.categoryId,
      today: todayValue(),
    }),
  ]);

  const coupons: Record<string, number> = {};
  for (const c of recharge.coupons) coupons[c.mealTypeId.toString()] = c.count;

  return NextResponse.json({
    userId: recharge.userId.toString(),
    userName: recharge.user.fullName,
    rechargeId: recharge.id.toString(),
    meals: meals.map((m) => ({ id: m.id.toString(), name: m.name })),
    rates,
    paymentModes: paymentModes.map((p) => ({ id: p.id.toString(), name: p.name })),
    initial: {
      coupons,
      validTill: recharge.validTill ? recharge.validTill.toISOString().slice(0, 10) : "",
      paymentModeId: recharge.paymentModeId.toString(),
      remarks: recharge.remarks ?? "",
    },
  });
}
