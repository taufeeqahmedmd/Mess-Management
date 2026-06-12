import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * GET /api/settings/{branches|categories|meals}/[id] — current values for the
 * settings edit drawer, in the shape the matching *Form expects. RBAC per
 * entity. (Counters/Staff/Rates/Consumption are not served here.)
 */
const PERM: Record<string, string> = {
  branches: "settings.manage",
  categories: "categories.manage",
  meals: "meals.manage",
};

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entity, id } = await params;
  const perm = PERM[entity];
  if (!perm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!can(actor, perm as Parameters<typeof can>[1])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let bid: bigint;
  try {
    bid = BigInt(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (entity === "branches") {
    const b = await prisma.branch.findFirst({ where: { id: bid, deletedAt: null } });
    if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ id: b.id.toString(), code: b.code, name: b.name, address: b.address ?? "", status: b.status === "inactive" ? "inactive" : "active" });
  }
  if (entity === "categories") {
    const c = await prisma.category.findUnique({ where: { id: bid } });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      id: c.id.toString(),
      code: c.code,
      name: c.name,
      identifierLabel: c.identifierLabel,
      identifierRegex: c.identifierRegex,
      identifierRequired: c.identifierRequired,
      identifierUnique: c.identifierUnique,
      status: c.status === "inactive" ? "inactive" : "active",
    });
  }
  if (entity === "meals") {
    const m = await prisma.mealType.findUnique({ where: { id: bid } });
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ id: m.id.toString(), code: m.code, name: m.name, startTime: m.startTime, endTime: m.endTime, active: m.active });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
