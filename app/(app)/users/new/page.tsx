import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { UserForm } from "../user-form";
import { createUserAction } from "../actions";

export default async function NewUserPage() {
  const actor = await requireActor();
  if (!can(actor, "users.create")) redirect("/dashboard");

  const [categories, departments, branches] = await Promise.all([
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.department.findMany({
      where: actor.branchId ? { branchId: BigInt(actor.branchId) } : {},
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">New cardholder</h1>
      </div>
      <UserForm
        action={createUserAction}
        categories={categories.map((c) => ({ id: c.id.toString(), name: c.name, identifierLabel: c.identifierLabel, identifierRequired: c.identifierRequired }))}
        departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
