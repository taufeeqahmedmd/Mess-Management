import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * GET /api/settings/staff[?id=] — data for the staff Add/Edit drawer: role /
 * branch / counter options (branch-scoped, Super-Admin role hidden from non-SA),
 * plus the staff record + assigned counters when editing. RBAC `staff.manage`.
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "staff.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const idParam = new URL(req.url).searchParams.get("id");
  const branchScope = actor.branchId ? { branchId: BigInt(actor.branchId) } : {};

  const [roles, branches, counters] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
    prisma.counter.findMany({ where: { deletedAt: null, status: "active", ...branchScope }, orderBy: { name: "asc" } }),
  ]);

  const payload: Record<string, unknown> = {
    roles: roles.filter((r) => actor.isSuperAdmin || r.name !== "Super Admin").map((r) => ({ id: r.id.toString(), name: r.name })),
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name })),
    counters: counters.map((c) => ({ id: c.id.toString(), name: c.name })),
    canChooseBranch: !actor.branchId,
  };

  if (idParam) {
    let staffId: bigint;
    try {
      staffId = BigInt(idParam);
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const s = await prisma.appUser.findUnique({
      where: { id: staffId },
      include: { cardholder: { select: { code: true } } },
    });
    if (!s || s.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (actor.branchId && s.branchId?.toString() !== actor.branchId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const assigned = await prisma.counterOperator.findMany({ where: { appUserId: staffId }, select: { counterId: true } });
    payload.staff = {
      id: s.id.toString(),
      name: s.name,
      mobile: s.mobile,
      roleId: s.roleId.toString(),
      branchId: s.branchId?.toString() ?? "",
      status: s.status,
      cardholderCode: s.cardholder?.code ?? "",
    };
    payload.assignedCounterIds = assigned.map((a) => a.counterId.toString());
  }

  return NextResponse.json(payload);
}
