import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { setBranchStatusAction } from "./actions";

export default async function BranchesPage() {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) redirect("/dashboard");

  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Campuses / locations. Counters, rates, and cardholders are scoped to a branch.</p>
        <Link href="/settings/branches/new" className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
          Add branch
        </Link>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-2">No branches yet. Add the first one.</td></tr>
            ) : (
              branches.map((b) => (
                <tr key={b.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{b.code}</td>
                  <td className="px-4 py-3 text-ink">{b.name}</td>
                  <td className="px-4 py-3 text-ink-2">{b.address ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${b.status === "active" ? "bg-sage" : "bg-muted-2"}`} />
                      {b.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/branches/${b.id}/edit`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Edit</Link>
                      <ConfirmActionForm
                        action={setBranchStatusAction}
                        fields={{ id: b.id.toString(), status: b.status === "active" ? "inactive" : "active" }}
                        confirm={{
                          title: b.status === "active" ? "Deactivate branch" : "Activate branch",
                          message: `${b.status === "active" ? "Deactivate" : "Activate"} “${b.name}”?`,
                          confirmLabel: "Yes",
                          tone: b.status === "active" ? "danger" : "default",
                        }}
                        successMessage={b.status === "active" ? "Branch deactivated." : "Branch activated."}
                        buttonClassName="rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep disabled:opacity-60"
                      >
                        {b.status === "active" ? "Deactivate" : "Activate"}
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
