import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { resolveDateRange, redemptionWhere, type ConsumptionFilter } from "@/services/reporting";

const HEADER = [
  "redeemedAt",
  "cardholder",
  "code",
  "category",
  "meal",
  "counter",
  "paidBy",
  "sale",
  "vendorCost",
  "profitLoss",
];

function toBig(v: string | null): bigint | undefined {
  if (!v) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

/** GET /api/reports/consumption — branch-scoped consumption CSV honouring the same filters as the page. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "reports.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k);
  const range = resolveDateRange(g("from") ?? undefined, g("to") ?? undefined, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const paidByRaw = g("paidBy");
  const paidBy = paidByRaw === "wallet" || paidByRaw === "coupon" ? paidByRaw : undefined;

  const f: ConsumptionFilter = {
    branchId,
    from: range.from,
    toExclusive: range.toExclusive,
    mealTypeId: toBig(g("meal")),
    counterId: toBig(g("counter")),
    categoryId: toBig(g("category")),
    paidBy,
  };

  const [rows, categories] = await Promise.all([
    prisma.redemption.findMany({
      where: redemptionWhere(f),
      include: { user: true, mealType: true, counter: true },
      orderBy: { redeemedAt: "desc" },
      take: 50000,
    }),
    prisma.category.findMany(),
  ]);
  const catName = new Map(categories.map((c) => [c.id.toString(), c.name]));

  const body = rows.map((r) => [
    r.redeemedAt.toISOString(),
    r.user.fullName,
    r.user.code,
    r.categoryId ? catName.get(r.categoryId.toString()) ?? "" : "",
    r.mealType.name,
    r.counter.name,
    r.paidBy ?? "",
    r.amount.toFixed(2),
    r.vendorAmount.toFixed(2),
    r.amount.minus(r.vendorAmount).toFixed(2),
  ]);

  const csv = toCsv([HEADER, ...body]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consumption_${range.fromStr}_${range.toStr}.csv"`,
    },
  });
}
