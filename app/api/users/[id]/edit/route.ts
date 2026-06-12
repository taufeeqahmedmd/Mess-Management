import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * GET /api/users/[id]/edit — current values for the cardholder edit drawer.
 * RBAC `users.edit`, branch-scoped. Returns the UserData shape consumed by
 * <UserForm>.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "users.edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.branchId && user.branchId.toString() !== actor.branchId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: user.id.toString(),
    code: user.code,
    fullName: user.fullName,
    categoryId: user.categoryId.toString(),
    departmentId: user.departmentId ? user.departmentId.toString() : "",
    branchId: user.branchId.toString(),
    phone: user.phone ?? "",
    email: user.email ?? "",
    cardExpiryDate: user.cardExpiryDate ? user.cardExpiryDate.toISOString().slice(0, 10) : "",
    photoUrl: user.photoUrl ?? "",
    status: user.status,
  });
}
