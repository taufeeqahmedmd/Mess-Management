import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { FoodItemForm } from "../food-item-form";
import { createFoodItemAction } from "../actions";

export default async function NewFoodItemPage() {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/dashboard");

  const [meals, branches] = await Promise.all([
    prisma.mealType.findMany({ orderBy: { name: "asc" } }),
    // Only an all-branch actor (Super Admin) needs the branch list.
    actor.branchId
      ? Promise.resolve([] as { id: bigint; name: string }[])
      : prisma.branch.findMany({ where: { deletedAt: null, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/settings/food-items" className="hover:text-gold-deep">Food Items</Link> / New
        </p>
        <h2 className="mt-1 font-display text-[20px] font-bold text-ink">Add food item</h2>
      </div>
      <FoodItemForm
        action={createFoodItemAction}
        meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        canChooseBranch={!actor.branchId}
      />
    </div>
  );
}
