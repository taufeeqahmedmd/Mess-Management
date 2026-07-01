import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { updateLocationAction } from "../../actions";
import { LocationForm, type LocationData } from "../../location-form";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/settings/delivery-locations");

  const { id } = await params;
  let locId: bigint;
  try {
    locId = BigInt(id);
  } catch {
    notFound();
  }

  const l = await prisma.deliveryLocation.findUnique({ where: { id: locId } });
  if (!l) notFound();
  if (actor.branchId && l.branchId?.toString() !== actor.branchId) redirect("/settings/delivery-locations");

  const branches = actor.branchId
    ? []
    : await prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const location: LocationData = {
    id: l.id.toString(),
    name: l.name,
    branchId: l.branchId?.toString() ?? "",
    status: l.status === "active" ? "active" : "inactive",
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-muted-2">
        <Link href="/settings/delivery-locations" className="hover:text-gold-deep">Delivery Locations</Link> / {l.name}
      </p>
      <LocationForm
        action={updateLocationAction}
        location={location}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
