import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { StaffForm } from "../staff-form";
import { createStaffAction } from "../actions";

export default async function NewStaffPage() {
  const actor = await requireActor();
  if (!can(actor, "staff.manage")) redirect("/dashboard");

  const [roles, branches] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
  ]);
  const roleOptions = roles
    .filter((r) => actor.isSuperAdmin || r.name !== "Super Admin")
    .map((r) => ({ id: r.id.toString(), name: r.name }));
  const branchOptions = branches.map((b) => ({ id: b.id.toString(), name: b.name }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/staff" className="hover:text-gold-deep">Staff</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New staff member</h1>
      </div>
      <StaffForm
        action={createStaffAction}
        roles={roleOptions}
        branches={branchOptions}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
