import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

/** GET /api/recharges/sample — recharge import template (header + example row). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "recharge.import")) return new NextResponse("Forbidden", { status: 403 });

  const meals = await prisma.mealType.findMany({
    where: { active: true },
    orderBy: { startTime: "asc" },
    select: { code: true },
  });

  const header = ["identifier", "amount", ...meals.map((m) => m.code), "paymentMode", "validTill", "remarks"];
  const example = ["ADM2024001", "200", ...meals.map(() => "0"), "CASH", "2027-06-30", "Sample recharge"];

  const csv = toCsv([header, example]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="recharges-sample.csv"',
    },
  });
}
