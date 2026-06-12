import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { setCounterStatusAction } from "./actions";

export default async function CountersPage() {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  const counters = await prisma.counter.findMany({
    where: actor.branchId ? { branchId: BigInt(actor.branchId) } : undefined,
    orderBy: { code: "asc" },
    include: { _count: { select: { operators: true } }, branch: { select: { code: true, name: true } } },
  });
  // All-branch actors manage counters across branches → show which branch each
  // belongs to. Scoped actors only ever see their own branch, so hide the column.
  const showBranch = actor.branchId === null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[680px] text-[13px] text-muted">Counter devices and their assigned operators.</p>
        <Link href="/settings/counters/new" className={BTN_PRIMARY}>
          <PlusGlyph />
          Add counter
        </Link>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Code</th>
                <th className={TH}>Name</th>
                {showBranch ? <th className={TH}>Branch</th> : null}
                <th className={`${TH} text-right`}>Operators</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {counters.length === 0 ? (
                <tr><td colSpan={showBranch ? 6 : 5} className="px-5 py-12 text-center text-muted">No counters yet. Add the first one.</td></tr>
              ) : (
                counters.map((c) => {
                  const on = c.status === "active";
                  return (
                    <tr key={c.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} font-mono text-muted`}>{c.code}</td>
                      <td className={`${TD} font-medium text-ink`}>{c.name}</td>
                      {showBranch ? <td className={`${TD} text-muted`}>{c.branch.name}</td> : null}
                      <td className={`${TD} text-right font-mono text-ink-2`}>{c._count.operators}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${on ? "text-sage-deep" : "text-muted"}`}>
                          <span className={`size-[7px] rounded-full ${on ? "bg-sage" : "bg-muted-2"}`} />
                          {on ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/settings/counters/${c.id}/edit`} className={LINK_ACT_GOLD}>Edit</Link>
                          <ConfirmActionForm
                            action={setCounterStatusAction}
                            className="inline"
                            fields={{ id: c.id.toString(), status: on ? "inactive" : "active" }}
                            confirm={{
                              title: on ? "Deactivate counter" : "Activate counter",
                              message: `${on ? "Deactivate" : "Activate"} “${c.name}”?`,
                              confirmLabel: "Yes",
                              tone: on ? "danger" : "default",
                            }}
                            successMessage={on ? "Counter deactivated." : "Counter activated."}
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
