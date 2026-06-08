import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { StaffForm, type StaffData } from "../../staff-form";
import { updateStaffAction } from "../../actions";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "staff.manage")) redirect("/dashboard");

  const { id } = await params;
  let staffId: bigint;
  try {
    staffId = BigInt(id);
  } catch {
    notFound();
  }

  const s = await prisma.appUser.findUnique({ where: { id: staffId } });
  if (!s || s.deletedAt) notFound();

  // A scoped admin can't edit staff outside their branch.
  if (actor.branchId && s.branchId?.toString() !== actor.branchId) redirect("/settings/staff");

  const [roles, branches] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
  ]);
  const roleOptions = roles
    .filter((r) => actor.isSuperAdmin || r.name !== "Super Admin")
    .map((r) => ({ id: r.id.toString(), name: r.name }));
  const branchOptions = branches.map((b) => ({ id: b.id.toString(), name: b.name }));

  const staff: StaffData = {
    id: s.id.toString(),
    name: s.name,
    mobile: s.mobile,
    roleId: s.roleId.toString(),
    branchId: s.branchId?.toString() ?? "",
    status: s.status,
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/staff" className="hover:text-gold-deep">Staff</Link> / {s.name}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit staff member</h1>
      </div>
      <StaffForm
        action={updateStaffAction}
        staff={staff}
        roles={roleOptions}
        branches={branchOptions}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
