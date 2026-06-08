import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { setStaffStatusAction } from "./actions";

export default async function StaffPage() {
  const actor = await requireActor();
  if (!can(actor, "staff.manage")) redirect("/dashboard");

  const staff = await prisma.appUser.findMany({
    where: { deletedAt: null, ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}) },
    include: { role: true, branch: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            <Link href="/settings" className="hover:text-gold-deep">Configurations</Link> / Staff
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Staff</h1>
          <p className="mt-1 text-sm text-ink-2">Portal employees who sign in to the console.</p>
        </div>
        <Link href="/settings/staff/new" className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
          Add staff
        </Link>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Mobile</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Branch</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-2">No staff yet.</td></tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{s.mobile}</td>
                  <td className="px-4 py-3 text-ink-2">{s.role.name}</td>
                  <td className="px-4 py-3 text-ink-2">{s.branch?.name ?? "All branches"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${s.status === "active" ? "bg-sage" : "bg-tomato"}`} />
                      {s.status === "active" ? "Active" : s.status === "locked" ? "Locked" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/staff/${s.id}/edit`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Edit</Link>
                      <form action={setStaffStatusAction}>
                        <input type="hidden" name="id" value={s.id.toString()} />
                        <input type="hidden" name="status" value={s.status === "active" ? "disabled" : "active"} />
                        <button type="submit" className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep">
                          {s.status === "active" ? "Disable" : "Activate"}
                        </button>
                      </form>
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
