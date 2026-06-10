import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CounterForm, type BranchOption } from "../counter-form";
import { createCounterAction } from "../actions";

export default async function NewCounterPage() {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  // All-branch (Super Admin) actors choose the branch; scoped actors inherit
  // their own branch server-side and see no picker.
  const branches: BranchOption[] =
    actor.branchId === null
      ? (
          await prisma.branch.findMany({
            where: { deletedAt: null, status: "active" },
            orderBy: { code: "asc" },
            select: { id: true, code: true, name: true },
          })
        ).map((b) => ({ id: b.id.toString(), code: b.code, name: b.name }))
      : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/counters" className="hover:text-gold-deep">Counters</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New counter</h1>
        <p className="mt-1 text-sm text-ink-2">Create the counter, then assign operators from its edit page.</p>
      </div>
      <CounterForm action={createCounterAction} branches={branches} />
    </div>
  );
}
