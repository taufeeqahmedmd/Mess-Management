import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setLocationStatusAction } from "./actions";

export default async function DeliveryLocationsPage() {
  const actor = await requireActor();
  if (!can(actor, "foodItems.manage")) redirect("/dashboard");

  const locations = await prisma.deliveryLocation.findMany({
    where: actor.branchId ? { OR: [{ branchId: BigInt(actor.branchId) }, { branchId: null }] } : {},
    include: { branch: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Delivery locations offered as searchable suggestions when raising a food request.</p>
        <Link href="/settings/delivery-locations/new" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add location
        </Link>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Name</th>
                <th className={TH}>Branch</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-muted">No delivery locations yet. Add the first one.</td></tr>
              ) : (
                locations.map((l) => {
                  const on = l.status === "active";
                  return (
                    <tr key={l.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-medium text-ink`}>{l.name}</td>
                      <td className={`${TD} text-muted`}>{l.branch?.name ?? "All branches"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${on ? "text-sage-deep" : "text-muted"}`}>
                          <span className={`size-[7px] rounded-full ${on ? "bg-sage" : "bg-muted-2"}`} />
                          {on ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/settings/delivery-locations/${l.id}/edit`} className={LINK_ACT_GOLD}>Edit</Link>
                          <ConfirmActionForm
                            action={setLocationStatusAction}
                            className="inline"
                            fields={{ id: l.id.toString(), status: on ? "inactive" : "active" }}
                            confirm={{
                              title: on ? "Deactivate location" : "Activate location",
                              message: `${on ? "Deactivate" : "Activate"} “${l.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Location deactivated." : "Location activated."}
                            buttonClassName={on ? LINK_ACT_DANGER : LINK_ACT_SAGE}
                          >
                            {on ? "Deactivate" : "Activate"}
                          </ConfirmActionForm>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
