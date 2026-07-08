import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { FoodItemForm } from "../../food-item-form";
import { updateFoodItemAction } from "../../actions";

export default async function EditFoodItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/dashboard");

  const { id: idStr } = await params;
  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    notFound();
  }

  const [item, meals, branches] = await Promise.all([
    prisma.foodItem.findUnique({ where: { id } }),
    prisma.mealType.findMany({ orderBy: { name: "asc" } }),
    actor.branchId
      ? Promise.resolve([] as { id: bigint; name: string }[])
      : prisma.branch.findMany({ where: { deletedAt: null, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!item) notFound();
  if (actor.branchId && item.branchId && item.branchId.toString() !== actor.branchId) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/settings/food-items" className="hover:text-gold-deep">Food Items</Link> / Edit
        </p>
        <h2 className="mt-1 font-display text-[20px] font-bold text-ink">Edit {item.name}</h2>
      </div>
      <FoodItemForm
        action={updateFoodItemAction}
        meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
        item={{
          id: item.id.toString(),
          code: item.code,
          name: item.name,
          kind: item.kind,
          unitPrice: item.unitPrice.toFixed(2),
          unitVendorPrice: item.unitVendorPrice.toFixed(2),
          mealTypeId: item.mealTypeId.toString(),
          branchId: item.branchId?.toString() ?? "",
          active: item.active,
        }}
      />
    </div>
  );
}
