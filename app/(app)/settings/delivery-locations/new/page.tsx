import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { createLocationAction } from "../actions";
import { LocationForm } from "../location-form";

export default async function NewLocationPage() {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/settings/delivery-locations");

  const branches = actor.branchId
    ? []
    : await prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-muted-2">
        <Link href="/settings/delivery-locations" className="hover:text-gold-deep">Delivery Locations</Link> / New
      </p>
      <LocationForm
        action={createLocationAction}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
