import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CounterCreateForm } from "../counter-create-form";
import type { BranchOption } from "../counter-form";

export default async function NewCounterPage() {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  // All-branch (Super Admin) actors choose the branch; scoped actors inherit
  // their own branch server-side and see no picker.
  const [branchRows, meals, staff] = await Promise.all([
    actor.branchId === null
      ? prisma.branch.findMany({ where: { deletedAt: null, status: "active" }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } })
      : Promise.resolve([] as { id: bigint; code: string; name: string }[]),
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.appUser.findMany({ where: { deletedAt: null, status: "active" }, include: { role: true }, orderBy: { name: "asc" } }),
  ]);
  const branches: BranchOption[] = branchRows.map((b) => ({ id: b.id.toString(), code: b.code, name: b.name }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/counters" className="hover:text-gold-deep">Counters</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New counter</h1>
        <p className="mt-1 text-sm text-ink-2">Set the details, the meals it serves with their windows, and its operators.</p>
      </div>
      <CounterCreateForm
        branches={branches}
        meals={meals.map((m) => ({
          id: m.id.toString(),
          name: m.name,
          code: m.code,
          defaultStart: m.startTime,
          defaultEnd: m.endTime,
        }))}
        staff={staff.map((s) => ({ id: s.id.toString(), name: s.name, mobile: s.mobile, role: s.role.name }))}
      />
    </div>
  );
}
