import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setFoodItemActiveAction } from "./actions";

const KIND_LABEL: Record<string, string> = { beverage: "Beverage", snack: "Snack", meal: "Meal", custom: "Custom" };

export default async function FoodItemsPage() {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/dashboard");

  // All-branch (null) items + the actor's branch items (scoped admins).
  const items = await prisma.foodItem.findMany({
    where: actor.branchId ? { OR: [{ branchId: null }, { branchId: BigInt(actor.branchId) }] } : {},
    include: { mealType: true, branch: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">
          The orderable catalog for food requests. CATALOG-ONLY pricing — a request always charges these prices.
        </p>
        <Link href="/settings/food-items/new" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add food item
        </Link>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                <th className={TH}>Branch</th>
                <th className={TH}>Kind</th>
                <th className={TH}>Reports under</th>
                <th className={`${TH} text-right`}>Price</th>
                <th className={`${TH} text-right`}>Vendor</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-muted">No food items yet. Add the first one.</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                    <td className={`${TD} font-mono text-muted`}>{it.code}</td>
                    <td className={`${TD} font-medium text-ink`}>{it.name}</td>
                    <td className={`${TD} text-ink-2`}>{it.branch ? it.branch.name : <span className="text-muted-2">All branches</span>}</td>
                    <td className={`${TD} text-ink-2`}>{KIND_LABEL[it.kind] ?? it.kind}</td>
                    <td className={`${TD} text-ink-2`}>{it.mealType.name}</td>
                    <td className={`${TD} text-right font-mono text-ink`}>{inr(it.unitPrice)}</td>
                    <td className={`${TD} text-right font-mono text-muted`}>{inr(it.unitVendorPrice)}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${it.active ? "text-sage-deep" : "text-muted"}`}>
                        <span className={`size-[7px] rounded-full ${it.active ? "bg-sage" : "bg-muted-2"}`} />
                        {it.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/settings/food-items/${it.id}/edit`} className={LINK_ACT_GOLD}>Edit</Link>
                        <ConfirmActionForm
                          action={setFoodItemActiveAction}
                          className="inline"
                          fields={{ id: it.id.toString(), active: it.active ? "false" : "true" }}
                          confirm={{
                            title: it.active ? "Deactivate item" : "Activate item",
                            message: `${it.active ? "Deactivate" : "Activate"} “${it.name}”?`,
                            confirmLabel: "Yes",
                            tone: it.active ? "danger" : "default",
                          }}
                          successMessage={it.active ? "Item deactivated." : "Item activated."}
                          buttonClassName={it.active ? LINK_ACT_DANGER : LINK_ACT_SAGE}
                        >
                          {it.active ? "Deactivate" : "Activate"}
                        </ConfirmActionForm>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
