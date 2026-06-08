import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AccessControlGrid } from "./access-control-grid";

export default async function AccessControlPage() {
  const actor = await requireActor();
  if (!can(actor, "accessControl.manage")) redirect("/dashboard");

  const roles = await prisma.role.findMany({
    orderBy: { id: "asc" },
    include: { permissions: { include: { permission: true } } },
  });

  const data = roles.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    permissions: r.permissions.map((rp) => rp.permission.code),
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Access Control</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          Grant each role access to screens and actions. Changes take effect the next
          time an affected staff member signs in.
        </p>
      </div>

      <AccessControlGrid roles={data} />
    </div>
  );
}
