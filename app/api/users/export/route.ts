import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

export const HEADER = [
  "identifier",
  "fullName",
  "category",
  "phone",
  "email",
  "department",
  "branch",
  "status",
  "cardExpiry",
  "cardUid",
];

/** GET /api/users/export — branch-scoped cardholder CSV. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "users.view")) return new NextResponse("Forbidden", { status: 403 });

  const users = await prisma.user.findMany({
    where: { deletedAt: null, ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}) },
    include: {
      category: true,
      department: true,
      branch: true,
      cards: { where: { status: "active" }, take: 1 },
    },
    orderBy: { fullName: "asc" },
  });

  const rows = users.map((u) => [
    u.code,
    u.fullName,
    u.category.code,
    u.phone ?? "",
    u.email ?? "",
    u.department?.name ?? "",
    u.branch.name,
    u.status,
    u.cardExpiryDate ? u.cardExpiryDate.toISOString().slice(0, 10) : "",
    u.cards[0]?.cardUid ?? "",
  ]);

  const csv = toCsv([HEADER, ...rows]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cardholders.csv"',
    },
  });
}
