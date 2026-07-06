import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { BranchForm } from "../branch-form";
import { createBranchAction } from "../actions";

export default async function NewBranchPage() {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) redirect("/dashboard");

  const entities = await prisma.emailEntity.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/branches" className="hover:text-gold-deep">Branches</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New branch</h1>
        <p className="mt-1 text-sm text-ink-2">Create a campus / location. Counters, rates, and cardholders are then scoped to it.</p>
      </div>
      <BranchForm action={createBranchAction} entities={entities.map((e) => ({ id: e.id.toString(), name: e.name }))} />
    </div>
  );
}
