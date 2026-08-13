import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can, canAccessBranch } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { usageByMeal } from "@/services/reporting";
import { storedPeriod } from "@/services/settlement";

/** GET /api/settlements/:id — per-meal vendor-payable breakdown CSV for a settlement. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "settlements.view")) return new NextResponse("Forbidden", { status: 403 });

  const { id: idStr } = await params;
  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const s = await prisma.vendorSettlement.findUnique({ where: { id }, include: { vendor: true, branch: true } });
  if (!s || !canAccessBranch(actor, s.branchId.toString())) return new NextResponse("Not found", { status: 404 });

  const p = storedPeriod(s.periodStart, s.periodEnd);
  const rows = await usageByMeal(prisma, { branchId: s.branchId, from: p.start, toExclusive: p.toExclusive });

  const header = ["meal", "meals", "vendorPayable"];
  const body = rows.map((r) => [r.label, String(r.count), r.cost.toFixed(2)]);
  body.push(["TOTAL", String(s.mealCount), s.grossAmount.toFixed(2)]);

  const csv = toCsv([header, ...body]);
  const period = `${s.periodStart.toISOString().slice(0, 10)}_${s.periodEnd.toISOString().slice(0, 10)}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="settlement_${s.vendor.code}_${period}.csv"`,
    },
  });
}
