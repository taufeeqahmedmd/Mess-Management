import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setCategoryStatusAction, setCategoryContactRequiredAction } from "./actions";

export default async function CategoriesPage() {
  const actor = await requireActor();
  if (!can(actor, "categories.manage")) redirect("/dashboard");

  // Operational screen: identify/sort by the per-category Identifier label, with
  // Name as a deterministic tiebreaker (the label isn't unique). Reports still
  // consolidate by category_id and present the Name — see services/reporting.ts.
  const categories = await prisma.category.findMany({
    orderBy: [{ identifierLabel: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Cardholder types and their identifier rules.</p>
        <button type="button" data-settings-add="categories" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add category
        </button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Identifier</th>
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                <th className={TH}>Status</th>
                <th className={TH}>Phone &amp; email</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No categories yet. Add the first one.</td></tr>
              ) : (
                categories.map((c) => {
                  const on = c.status === "active";
                  return (
                    <tr key={c.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-medium text-ink`}>
                        {c.identifierLabel}{c.identifierRequired ? "" : <span className="font-normal text-muted-2"> (optional)</span>}
                      </td>
                      <td className={`${TD} font-mono text-muted`}>{c.code}</td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-gold-soft px-2.5 py-1 text-[12px] text-gold-deep">
                          <span className="size-1.5 rounded-full bg-gold" />{c.name}
                        </span>
                      </td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${on ? "text-sage-deep" : "text-muted"}`}>
                          <span className={`size-[7px] rounded-full ${on ? "bg-sage" : "bg-muted-2"}`} />
                          {on ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={TD}>
                        <ConfirmActionForm
                          action={setCategoryContactRequiredAction}
                          className="inline"
                          fields={{ id: c.id.toString(), contactRequired: (!c.contactRequired).toString() }}
                          confirm={{
                            title: c.contactRequired ? "Make phone & email optional" : "Make phone & email required",
                            message: c.contactRequired
                              ? `New “${c.name}” cardholders will no longer be required to have a phone & email. Continue?`
                              : `New “${c.name}” cardholders will be required to have a phone & email. Continue?`,
                            confirmLabel: "Yes",
                          }}
                          successMessage={c.contactRequired ? "Phone & email are now optional." : "Phone & email are now required."}
                          buttonAriaLabel={`Phone and email are ${c.contactRequired ? "required" : "optional"} for ${c.name}. Toggle.`}
                          buttonClassName="inline-flex items-center gap-2 rounded-pill px-1.5 py-1 transition-colors hover:bg-surface-2"
                        >
                          <span className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors ${c.contactRequired ? "bg-gold" : "bg-line-strong"}`}>
                            <span className={`inline-block size-3.5 transform rounded-full bg-surface shadow-sm transition-transform ${c.contactRequired ? "translate-x-4" : "translate-x-0.5"}`} />
                          </span>
                          <span className={`text-[12px] font-medium ${c.contactRequired ? "text-gold-deep" : "text-muted"}`}>
                            {c.contactRequired ? "Required" : "Optional"}
                          </span>
                        </ConfirmActionForm>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" data-settings-edit="categories" data-settings-id={c.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                          <ConfirmActionForm
                            action={setCategoryStatusAction}
                            className="inline"
                            fields={{ id: c.id.toString(), status: on ? "inactive" : "active" }}
                            confirm={{
                              title: on ? "Deactivate category" : "Activate category",
                              message: `${on ? "Deactivate" : "Activate"} “${c.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Category deactivated." : "Category activated."}
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
