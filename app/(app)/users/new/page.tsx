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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-7">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / New
        </p>
        <h1 className="mt-1 font-display text-[27px] font-bold tracking-[-0.6px] text-ink">New cardholder</h1>
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
