import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { formatDateTimeInZone, formatDateInZone } from "@/lib/time";
import { parseRechargeFilter, rechargeWhere } from "@/services/reporting";

const HEADER = [
  "date",
  "cardholder",
  "code",
  "amount",
  "coupons",
  "paymentMode",
  "transactionId",
  "operator",
  "status",
  "validTill",
  "remarks",
];

/**
 * GET /api/reports/recharges — branch-scoped recharge CSV honouring the same
 * filters as the Reports → Recharges tab (q/from/to/mode/status/source/operator).
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "recharge.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? undefined;
  const filter = parseRechargeFilter(
    { q: g("q"), from: g("from"), to: g("to"), mode: g("mode"), status: g("status"), source: g("source"), operator: g("operator") },
    actor.branchId ? BigInt(actor.branchId) : null,
  );

  const recharges = await prisma.recharge.findMany({
    where: rechargeWhere(filter),
    include: { user: true, paymentMode: true, appUser: true, coupons: true },
    orderBy: { id: "desc" },
    take: 50000,
  });

  const rows = recharges.map((r) => [
    formatDateTimeInZone(r.rechargedAt),
    r.user.fullName,
    r.user.code,
    r.amount.toFixed(2),
    String(r.coupons.reduce((s, c) => s + c.count, 0)),
    r.paymentMode.name,
    r.transactionId ?? "",
    r.appUser?.name ?? "Self Recharge",
    r.status,
    r.validTill ? formatDateInZone(r.validTill) : "",
    r.remarks ?? "",
  ]);

  const csv = toCsv([HEADER, ...rows]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="recharges.csv"',
    },
  });
}
