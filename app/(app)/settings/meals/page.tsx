import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setMealActiveAction } from "./actions";

export default async function MealsPage() {
  const actor = await requireActor();
  if (!can(actor, "meals.manage")) redirect("/dashboard");

  const meals = await prisma.mealType.findMany({ orderBy: { startTime: "asc" } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Meal types and their default service windows. Assign meals to counters from the Counters page.</p>
        <button type="button" data-settings-add="meals" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add meal
        </button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                <th className={TH}>Default window</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meals.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No meals yet. Add the first one.</td></tr>
              ) : (
                meals.map((m) => (
                  <tr key={m.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                    <td className={`${TD} font-mono text-muted`}>{m.code}</td>
                    <td className={`${TD} font-medium text-ink`}>{m.name}</td>
                    <td className={`${TD} font-mono text-muted`}>{m.startTime}&ndash;{m.endTime}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${m.active ? "text-sage-deep" : "text-muted"}`}>
                        <span className={`size-[7px] rounded-full ${m.active ? "bg-sage" : "bg-muted-2"}`} />
                        {m.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" data-settings-edit="meals" data-settings-id={m.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                        <ConfirmActionForm
                          action={setMealActiveAction}
                          className="inline"
                          fields={{ id: m.id.toString(), active: m.active ? "false" : "true" }}
                          confirm={{
                            title: m.active ? "Deactivate meal" : "Activate meal",
                            message: `${m.active ? "Deactivate" : "Activate"} “${m.name}”?`,
                            confirmLabel: "Yes",
                            tone: m.active ? "danger" : "default",
                          }}
                          successMessage={m.active ? "Meal deactivated." : "Meal activated."}
                          buttonClassName={m.active ? LINK_ACT_DANGER : LINK_ACT_SAGE}
                        >
                          {m.active ? "Deactivate" : "Activate"}
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
