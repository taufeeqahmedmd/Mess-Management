import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { BTN_GHOST, BTN_PRIMARY, INPUT_FIND, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph, UploadGlyph, PlusGlyph } from "@/components/ui/glyphs";
import { setUserStatusAction } from "./actions";
import { CardholderDrawer } from "./cardholder-drawer";

const ST: Record<string, { dot: string; text: string; label: string }> = {
  active: { dot: "bg-sage", text: "text-sage-deep", label: "Active" },
  suspended: { dot: "bg-tomato", text: "text-tomato", label: "Blocked" },
  inactive: { dot: "bg-muted-2", text: "text-muted", label: "Inactive" },
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "users.view")) redirect("/dashboard");
  const canEdit = can(actor, "users.edit");
  const canCreate = can(actor, "users.create");
  const canChooseBranch = !actor.branchId;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
            { cards: { some: { cardUid: { contains: q } } } },
          ],
        }
      : {}),
  };

  const canManage = canCreate || canEdit;
  const [users, total, categories, departments, branches] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { category: true, wallet: true, couponBalances: true, cards: { where: { status: "active" }, take: 1 } },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    canManage ? prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    canManage
      ? prisma.department.findMany({ where: actor.branchId ? { branchId: BigInt(actor.branchId) } : {}, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    canManage ? prisma.branch.findMany({ where: actor.branchId ? { id: BigInt(actor.branchId) } : {}, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Cardholders</h1>
          <p className="mt-1 text-[13px] text-muted">
            {total} cardholder{total === 1 ? "" : "s"}.{q ? " Filtered by search." : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href="/api/users/export" className={BTN_GHOST}>
            <DownloadGlyph />
            Export CSV
          </a>
          {can(actor, "users.import") ? (
            <Link href="/users/import" className={BTN_GHOST}>
              <UploadGlyph />
              Import
            </Link>
          ) : null}
          {canCreate ? (
            <button type="button" data-add-cardholder className={BTN_PRIMARY}>
              <PlusGlyph />
              Add cardholder
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${PANEL} p-[18px_20px]`}>
        <form method="get" className="flex flex-col gap-2.5 sm:flex-row">
          <input name="q" defaultValue={q} placeholder="Search by id, name, phone, email, card UID…" className={`${INPUT_FIND} sm:max-w-[420px]`} />
          <button type="submit" className={BTN_PRIMARY}>Search</button>
          {q ? (
            <Link href="/users" className="inline-flex items-center px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink-2">Clear</Link>
          ) : null}
        </form>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Identifier</th>
                <th className={TH}>Name</th>
                <th className={TH}>Category</th>
                <th className={TH}>Card UID</th>
                <th className={`${TH} text-right`}>Wallet</th>
                <th className={`${TH} text-right`}>Coupons</th>
                <th className={TH}>Validity</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-muted">{q ? "No cardholders match your search." : "No cardholders yet."}</td></tr>
              ) : (
                users.map((u) => {
                  const st = ST[u.status] ?? ST.inactive;
                  const blocked = u.status === "suspended";
                  return (
                    <tr key={u.id.toString()} className={`border-b border-line transition-colors last:border-0 hover:bg-surface-2 ${blocked ? "opacity-75" : ""}`}>
                      <td className={`${TD} whitespace-nowrap font-mono text-muted`}>{u.code}</td>
                      <td className={TD}>
                        <Link href={`/users/${u.id}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{u.fullName}</Link>
                      </td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
                          <span className="size-1.5 rounded-full bg-gold" />
                          {u.category.name}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono text-ink-2`}>{u.cards[0]?.cardUid ?? "—"}</td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(u.wallet?.balanceAmount ?? new Prisma.Decimal(0))}</td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{u.couponBalances.reduce((s, cb) => s + cb.count, 0)}</td>
                      <td className={`${TD} whitespace-nowrap text-muted`}>{u.cardExpiryDate ? u.cardExpiryDate.toISOString().slice(0, 10) : "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${st.text}`}>
                          <span className={`size-[7px] rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit ? (
                            <>
                              <button type="button" data-edit-user={u.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                              <ConfirmActionForm
                                action={setUserStatusAction}
                                fields={{ id: u.id.toString(), status: u.status === "active" ? "suspended" : "active" }}
                                confirm={{
                                  title: u.status === "active" ? "Block cardholder" : "Unblock cardholder",
                                  message: `${u.status === "active" ? "Block" : "Unblock"} “${u.fullName}”?`,
                                  confirmLabel: "Yes",
                                  tone: u.status === "active" ? "danger" : "default",
                                }}
                                successMessage={u.status === "active" ? "Cardholder blocked." : "Cardholder unblocked."}
                                buttonClassName={u.status === "active" ? LINK_ACT_DANGER : LINK_ACT_SAGE}
                              >
                                {u.status === "active" ? "Block" : "Unblock"}
                              </ConfirmActionForm>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-muted-2">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>

      {canManage ? (
        <CardholderDrawer
          categories={categories.map((c) => ({ id: c.id.toString(), name: c.name, identifierLabel: c.identifierLabel, identifierRequired: c.identifierRequired }))}
          departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))}
          branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
          canChooseBranch={canChooseBranch}
        />
      ) : null}
    </div>
  );
}
