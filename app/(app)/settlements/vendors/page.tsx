import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { setVendorStatusAction } from "../actions";

export default async function VendorsPage() {
  const actor = await requireActor();
  if (!can(actor, "settlements.view")) redirect("/dashboard");
  const canManage = can(actor, "settlements.manage");

  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/settlements" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">← Settlements</Link>
          <h1 className="font-display text-2xl font-semibold text-ink">Vendors</h1>
          <p className="mt-1 text-sm text-ink-2">Caterers paid via period settlements.</p>
        </div>
        {canManage ? (
          <Link href="/settlements/vendors/new" className="rounded-sm bg-gold px-4 py-2.5 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
            New vendor
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">GSTIN</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-2">No vendors yet.</td></tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink-2">{v.code}</td>
                  <td className="px-4 py-3 text-ink">{v.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{v.gstin ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${v.status === "active" ? "bg-sage" : "bg-muted-2"}`} />
                      {v.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage ? (
                        <>
                          <Link href={`/settlements/vendors/${v.id}/edit`} className="rounded-sm px-2.5 py-1 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">
                            Edit
                          </Link>
                          <ConfirmActionForm
                            action={setVendorStatusAction}
                            className="inline"
                            fields={{ id: v.id.toString(), status: v.status === "active" ? "inactive" : "active" }}
                            confirm={{
                              title: v.status === "active" ? "Deactivate vendor" : "Activate vendor",
                              message: `${v.status === "active" ? "Deactivate" : "Activate"} ${v.name}?`,
                              confirmLabel: "Yes",
                              tone: v.status === "active" ? "danger" : "default",
                            }}
                            successMessage="Vendor updated."
                            buttonClassName="rounded-sm px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep"
                          >
                            {v.status === "active" ? "Deactivate" : "Activate"}
                          </ConfirmActionForm>
                        </>
                      ) : (
                        <span className="text-xs text-muted-2">—</span>
                      )}
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
