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
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Access Control</h1>
        <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-muted">
          Grant each role access to screens and actions. Changes take effect the next time an
          affected staff member signs in.
        </p>
      </div>

      <AccessControlGrid roles={data} />
    </div>
  );
}
