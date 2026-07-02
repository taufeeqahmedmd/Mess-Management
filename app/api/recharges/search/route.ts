import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * GET /api/recharges/search?q= — live cardholder lookup for the recharge search
 * box (name / code / phone / card UID). Branch-scoped and gated on
 * `recharge.create` (the same permission that gates starting a recharge), so it
 * never surfaces a cardholder the actor couldn't otherwise recharge.
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "recharge.create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const branchFilter = actor.branchId ? { branchId: BigInt(actor.branchId) } : {};
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...branchFilter,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { cards: { some: { cardUid: { contains: q } } } },
      ],
    },
    include: { category: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id.toString(),
      code: u.code,
      fullName: u.fullName,
      category: u.category.name,
    })),
  );
}
