import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { BranchForm, type BranchData } from "../../branch-form";
import { updateBranchAction } from "../../actions";

export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) redirect("/dashboard");

  const { id } = await params;
  let branchId: bigint;
  try {
    branchId = BigInt(id);
  } catch {
    notFound();
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.deletedAt) notFound();

  const branchData: BranchData = {
    id: branch.id.toString(),
    code: branch.code,
    name: branch.name,
    address: branch.address ?? "",
    collectorCode: branch.collectorCode ?? "",
    status: branch.status === "inactive" ? "inactive" : "active",
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/branches" className="hover:text-gold-deep">Branches</Link> / {branch.name}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit branch</h1>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-ink">Details</h2>
        <BranchForm action={updateBranchAction} branch={branchData} />
      </section>
    </div>
  );
}
