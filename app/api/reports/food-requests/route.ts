import { NextResponse } from "next/server";
import { Prisma, type FoodRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { resolveDateRange } from "@/services/reporting";

const HEADER = [
  "ref",
  "raisedAt",
  "cardholder",
  "code",
  "department",
  "requestedBy",
  "vendor",
  "status",
  "charged",
  "vendorCost",
];

const STATUSES: FoodRequestStatus[] = [
  "raised", "pending_approval", "approved", "vendor_accepted", "preparing", "out_for_delivery", "delivered", "rejected", "cancelled",
];

/** GET /api/reports/food-requests — branch-scoped request-wise cost CSV. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "reports.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k);
  const range = resolveDateRange(g("from") ?? undefined, g("to") ?? undefined, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const statusRaw = g("status");
  const status = STATUSES.includes(statusRaw as FoodRequestStatus) ? (statusRaw as FoodRequestStatus) : undefined;

  const where: Prisma.FoodRequestWhereInput = {
    createdAt: { gte: range.from, lt: range.toExclusive },
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
  };

  const rows = await prisma.foodRequest.findMany({
    where,
    include: { user: { include: { department: true } }, vendor: true, requestedBy: true },
    orderBy: { id: "desc" },
    take: 50000,
  });

  const body = rows.map((r) => [
    r.code,
    r.createdAt.toISOString(),
    r.user.fullName,
    r.user.code,
    r.user.department?.name ?? "",
    r.requestedBy.name,
    r.vendor?.name ?? "",
    r.status,
    r.amount.toFixed(2),
    r.vendorAmount.toFixed(2),
  ]);

  const csv = toCsv([HEADER, ...body]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="food_requests_${range.fromStr}_${range.toStr}.csv"`,
    },
  });
}
