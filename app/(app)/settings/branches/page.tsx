import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setBranchStatusAction } from "./actions";

export default async function BranchesPage() {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) redirect("/dashboard");

  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    include: { emailEntity: { select: { name: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Campuses / locations. Counters, rates, and cardholders are scoped to a branch.</p>
        <button type="button" data-settings-add="branches" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add branch
        </button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                <th className={TH}>Address</th>
                <th className={TH}>Email entity</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No branches yet. Add the first one.</td></tr>
              ) : (
                branches.map((b) => {
                  const on = b.status === "active";
                  return (
                    <tr key={b.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-mono text-muted`}>{b.code}</td>
                      <td className={`${TD} font-medium text-ink`}>{b.name}</td>
                      <td className={`${TD} text-muted`}>{b.address ?? "—"}</td>
                      <td className={TD}>
                        {b.emailEntity ? (
                          <span className="text-[12.5px] font-medium text-ink-2">{b.emailEntity.name}</span>
                        ) : (
                          <span className="text-[12.5px] text-muted">Not mapped</span>
                        )}
                      </td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${on ? "text-sage-deep" : "text-muted"}`}>
                          <span className={`size-[7px] rounded-full ${on ? "bg-sage" : "bg-muted-2"}`} />
                          {on ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" data-settings-edit="branches" data-settings-id={b.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                          <ConfirmActionForm
                            action={setBranchStatusAction}
                            className="inline"
                            fields={{ id: b.id.toString(), status: on ? "inactive" : "active" }}
                            confirm={{
                              title: on ? "Deactivate branch" : "Activate branch",
                              message: `${on ? "Deactivate" : "Activate"} “${b.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Branch deactivated." : "Branch activated."}
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
