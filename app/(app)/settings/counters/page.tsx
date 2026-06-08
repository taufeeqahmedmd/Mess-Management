import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { setCounterStatusAction } from "./actions";

export default async function CountersPage() {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  const counters = await prisma.counter.findMany({
    where: actor.branchId ? { branchId: BigInt(actor.branchId) } : undefined,
    orderBy: { code: "asc" },
    include: { _count: { select: { operators: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Counter devices and their assigned operators.</p>
        <Link href="/settings/counters/new" className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
          Add counter
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Operators</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {counters.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-2">No counters yet. Add the first one.</td></tr>
            ) : (
              counters.map((c) => (
                <tr key={c.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{c.code}</td>
                  <td className="px-4 py-3 text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-ink-2">{c._count.operators}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${c.status === "active" ? "bg-sage" : "bg-muted-2"}`} />
                      {c.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/counters/${c.id}/edit`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Edit</Link>
                      <ConfirmActionForm
                        action={setCounterStatusAction}
                        fields={{ id: c.id.toString(), status: c.status === "active" ? "inactive" : "active" }}
                        confirm={{
                          title: c.status === "active" ? "Deactivate counter" : "Activate counter",
                          message: `${c.status === "active" ? "Deactivate" : "Activate"} “${c.name}”?`,
                          confirmLabel: "Yes",
                          tone: c.status === "active" ? "danger" : "default",
                        }}
                        successMessage={c.status === "active" ? "Counter deactivated." : "Counter activated."}
                        buttonClassName="rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep disabled:opacity-60"
                      >
                        {c.status === "active" ? "Deactivate" : "Activate"}
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
  );
}
