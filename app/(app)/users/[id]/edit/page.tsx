import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { UserForm, type UserData } from "../../user-form";
import { updateUserAction } from "../../actions";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "users.edit")) redirect("/dashboard");

  const { id } = await params;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    notFound();
  }

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.deletedAt) notFound();
  if (actor.branchId && u.branchId.toString() !== actor.branchId) redirect("/users");

  const [categories, departments, branches] = await Promise.all([
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.department.findMany({
      where: actor.branchId ? { branchId: BigInt(actor.branchId) } : {},
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({ where: actor.branchId ? { id: BigInt(actor.branchId) } : {}, orderBy: { name: "asc" } }),
  ]);

  const userData: UserData = {
    id: u.id.toString(),
    code: u.code,
    fullName: u.fullName,
    categoryId: u.categoryId.toString(),
    departmentId: u.departmentId?.toString() ?? "",
    branchId: u.branchId.toString(),
    phone: u.phone ?? "",
    email: u.email ?? "",
    cardExpiryDate: u.cardExpiryDate ? u.cardExpiryDate.toISOString().slice(0, 10) : "",
    photoUrl: u.photoUrl ?? "",
    status: u.status,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-7">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / {u.fullName}
        </p>
        <h1 className="mt-1 font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Edit cardholder</h1>
      </div>
      <UserForm
        action={updateUserAction}
        user={userData}
        categories={categories.map((c) => ({ id: c.id.toString(), name: c.name, identifierLabel: c.identifierLabel, identifierRequired: c.identifierRequired, contactRequired: c.contactRequired }))}
        departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
