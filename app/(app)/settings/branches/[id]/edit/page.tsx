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

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, include: { paymentConfig: true } });
  if (!branch || branch.deletedAt) notFound();

  // Active entities for the dropdown — plus this branch's current entity even
  // if it has been deactivated, so the form doesn't silently unmap on save.
  const entities = await prisma.emailEntity.findMany({
    where: { OR: [{ active: true }, { id: branch.emailEntityId ?? BigInt(0) }] },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  const pc = branch.paymentConfig;
  const branchData: BranchData = {
    id: branch.id.toString(),
    code: branch.code,
    name: branch.name,
    address: branch.address ?? "",
    emailEntityId: branch.emailEntityId?.toString() ?? "",
    status: branch.status === "inactive" ? "inactive" : "active",
    paymentHasRow: Boolean(pc),
    paymentComplete: Boolean(pc?.collectorCode && pc?.url && pc?.apiKey && pc?.apiSecret),
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
        <BranchForm action={updateBranchAction} branch={branchData} entities={entities.map((e) => ({ id: e.id.toString(), name: e.name }))} />
      </section>
    </div>
  );
}
