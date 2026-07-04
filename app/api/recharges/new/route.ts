import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { defaultRatesForCategory } from "@/services/pricing";
import { todayValue } from "@/lib/time";

/**
 * GET /api/recharges/new?userId= — data for the create-recharge drawer: the
 * cardholder, active meals with their category rates, and payment modes. RBAC
 * `recharge.create`, branch-scoped.
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "recharge.create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("userId");
  let uid: bigint;
  try {
    uid = BigInt(userId ?? "");
  } catch {
    return NextResponse.json({ error: "Pick a cardholder first." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: uid }, include: { category: true } });
  if (!user || user.deletedAt) return NextResponse.json({ error: "Cardholder not found." }, { status: 404 });
  if (actor.branchId && user.branchId.toString() !== actor.branchId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [meals, paymentModes, rates] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.paymentMode.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    defaultRatesForCategory(prisma, { branchId: user.branchId, categoryId: user.categoryId, today: todayValue() }),
  ]);

  return NextResponse.json({
    userId: user.id.toString(),
    userName: user.fullName,
    meals: meals.map((m) => ({ id: m.id.toString(), name: m.name })),
    rates,
    paymentModes: paymentModes.map((p) => ({ id: p.id.toString(), name: p.name })),
  });
}
