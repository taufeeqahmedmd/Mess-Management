import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

/** GET /api/reports/balances — branch-scoped wallet + per-meal coupon balances CSV. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "reports.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(q
      ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [meals, users] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where,
      include: { category: true, wallet: true, couponBalances: true },
      orderBy: { fullName: "asc" },
      take: 50000,
    }),
  ]);

  const header = ["code", "cardholder", "category", "wallet", ...meals.map((m) => m.name)];
  const rows = users.map((u) => {
    const byMeal = new Map(u.couponBalances.map((c) => [c.mealTypeId.toString(), c.count]));
    return [
      u.code,
      u.fullName,
      u.category.name,
      (u.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2),
      ...meals.map((m) => String(byMeal.get(m.id.toString()) ?? 0)),
    ];
  });

  const csv = toCsv([header, ...rows]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balances.csv"',
    },
  });
}
