import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setVendorStatusAction } from "./actions";

export default async function SettingsVendorsPage() {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/dashboard");

  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { staff: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Caterers paid via period settlements. Staff with the Vendor or Mess Incharge role are attached to a vendor here.</p>
        <Link href="/settings/vendors/new" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add vendor
        </Link>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                <th className={TH}>GSTIN</th>
                <th className={TH}>Phone</th>
                <th className={`${TH} text-right`}>Staff</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No vendors yet. Add the first one.</td></tr>
              ) : (
                vendors.map((v) => {
                  const on = v.status === "active";
                  return (
                    <tr key={v.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-mono text-muted`}>{v.code}</td>
                      <td className={`${TD} font-medium text-ink`}>{v.name}</td>
                      <td className={`${TD} font-mono text-[12.5px] text-muted`}>{v.gstin ?? "—"}</td>
                      <td className={`${TD} font-mono text-muted`}>{v.phone ?? "—"}</td>
                      <td className={`${TD} text-right font-mono text-ink-2`}>{v._count.staff || "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${on ? "text-sage-deep" : "text-muted"}`}>
                          <span className={`size-[7px] rounded-full ${on ? "bg-sage" : "bg-muted-2"}`} />
                          {on ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/settings/vendors/${v.id}/edit`} className={LINK_ACT_GOLD}>Edit</Link>
                          <ConfirmActionForm
                            action={setVendorStatusAction}
                            className="inline"
                            fields={{ id: v.id.toString(), status: on ? "inactive" : "active" }}
                            confirm={{
                              title: on ? "Deactivate vendor" : "Activate vendor",
                              message: `${on ? "Deactivate" : "Activate"} “${v.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Vendor deactivated." : "Vendor activated."}
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
