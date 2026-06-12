import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setStaffStatusAction } from "./actions";

const ST: Record<string, { dot: string; text: string; label: string }> = {
  active: { dot: "bg-sage", text: "text-sage-deep", label: "Active" },
  locked: { dot: "bg-tomato", text: "text-tomato", label: "Locked" },
  disabled: { dot: "bg-muted-2", text: "text-muted", label: "Disabled" },
};

export default async function StaffPage() {
  const actor = await requireActor();
  if (!can(actor, "staff.manage")) redirect("/dashboard");

  const staff = await prisma.appUser.findMany({
    where: { deletedAt: null, ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}) },
    include: { role: true, branch: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Portal employees who sign in to the console.</p>
        <button type="button" data-settings-add="staff" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add staff
        </button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Name</th>
                <th className={TH}>Mobile</th>
                <th className={TH}>Role</th>
                <th className={TH}>Branch</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No staff yet.</td></tr>
              ) : (
                staff.map((s) => {
                  const st = ST[s.status] ?? ST.disabled;
                  const on = s.status === "active";
                  return (
                    <tr key={s.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-medium text-ink`}>{s.name}</td>
                      <td className={`${TD} font-mono text-muted`}>{s.mobile}</td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy-soft px-2.5 py-1 text-[12px] text-navy-text">
                          <span className="size-1.5 rounded-full bg-navy" />{s.role.name}
                        </span>
                      </td>
                      <td className={`${TD} text-muted`}>{s.branch?.name ?? "All branches"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${st.text}`}>
                          <span className={`size-[7px] rounded-full ${st.dot}`} />{st.label}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" data-settings-edit="staff" data-settings-id={s.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                          <ConfirmActionForm
                            action={setStaffStatusAction}
                            className="inline"
                            fields={{ id: s.id.toString(), status: on ? "disabled" : "active" }}
                            confirm={{
                              title: on ? "Disable staff" : "Activate staff",
                              message: `${on ? "Disable" : "Activate"} “${s.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Staff disabled." : "Staff activated."}
                            buttonClassName={on ? LINK_ACT_DANGER : LINK_ACT_SAGE}
                          >
                            {on ? "Disable" : "Activate"}
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
