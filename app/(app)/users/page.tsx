import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, type UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { BTN_GHOST, BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, LINK_ACT_SAGE, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph, UploadGlyph, PlusGlyph } from "@/components/ui/glyphs";
import { setUserStatusAction } from "./actions";
import { CardholderDrawer } from "./cardholder-drawer";
import { UserSearch } from "./user-search";

const ST: Record<string, { dot: string; text: string; label: string }> = {
  active: { dot: "bg-sage", text: "text-sage-deep", label: "Active" },
  suspended: { dot: "bg-tomato", text: "text-tomato", label: "Blocked" },
  inactive: { dot: "bg-muted-2", text: "text-muted", label: "Inactive" },
};

/** Parse a filter select's value into a BigInt id (invalid/absent → undefined). */
function idFilter(raw: string | undefined): bigint | undefined {
  const v = (raw ?? "").trim();
  if (!/^\d+$/.test(v)) return undefined;
  return BigInt(v);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    department?: string;
    branch?: string;
    status?: string;
    validity?: string;
    card?: string;
    coupons?: string;
    page?: string;
    size?: string;
  }>;
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

  const categoryId = idFilter(sp.category);
  const departmentId = idFilter(sp.department);
  // Branch filter only for all-branch actors — scoped staff stay pinned to theirs.
  const branchId = actor.branchId ? BigInt(actor.branchId) : idFilter(sp.branch);
  const status = ["active", "suspended", "inactive"].includes(sp.status ?? "") ? (sp.status as UserStatus) : undefined;
  const validity = ["valid", "expiring30", "expired", "none"].includes(sp.validity ?? "") ? sp.validity : undefined;
  const card = ["with", "without"].includes(sp.card ?? "") ? sp.card : undefined;
  const coupons = ["with", "none"].includes(sp.coupons ?? "") ? sp.coupons : undefined;

  // Validity windows are computed against today's UTC date (matches @db.Date storage).
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(validity === "valid" ? { validityExpired: false, cardExpiryDate: { gte: today } } : {}),
    ...(validity === "expiring30" ? { validityExpired: false, cardExpiryDate: { gte: today, lte: in30 } } : {}),
    ...(validity === "expired"
      ? { OR: [{ validityExpired: true }, { cardExpiryDate: { lt: today } }] }
      : {}),
    ...(validity === "none" ? { cardExpiryDate: null, validityExpired: false } : {}),
    ...(card === "with" ? { cards: { some: { status: "active" } } } : {}),
    ...(card === "without" ? { cards: { none: { status: "active" } } } : {}),
    ...(coupons === "with" ? { couponBalances: { some: { count: { gt: 0 } } } } : {}),
    ...(coupons === "none" ? { couponBalances: { none: { count: { gt: 0 } } } } : {}),
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

  // Both `validity: expired` and a search term produce OR groups — AND them
  // together explicitly so one doesn't clobber the other in the spread above.
  if (validity === "expired" && q) {
    where.AND = [
      { OR: [{ validityExpired: true }, { cardExpiryDate: { lt: today } }] },
      {
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
          { cards: { some: { cardUid: { contains: q } } } },
        ],
      },
    ];
    delete where.OR;
  }

  const canManage = canCreate || canEdit;
  const [users, total, categories, departments, branches] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { category: true, couponBalances: true, cards: { where: { status: "active" }, take: 1 } },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    // Loaded for BOTH the filter bar and the add/edit drawer.
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: actor.branchId ? { branchId: BigInt(actor.branchId) } : {}, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: actor.branchId ? { id: BigInt(actor.branchId) } : { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Cardholders</h1>
          <p className="mt-1 text-[13px] text-muted">
            {total} cardholder{total === 1 ? "" : "s"}.
            {q || categoryId || departmentId || status || validity || card || coupons || (!actor.branchId && idFilter(sp.branch)) ? " Filtered." : ""}
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
        <UserSearch
          initial={{
            q,
            category: categoryId?.toString() ?? "",
            department: departmentId?.toString() ?? "",
            branch: actor.branchId ? "" : (idFilter(sp.branch)?.toString() ?? ""),
            status: status ?? "",
            validity: validity ?? "",
            card: card ?? "",
            coupons: coupons ?? "",
          }}
          categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
          departments={departments.map((d) => ({ id: d.id.toString(), name: d.name }))}
          branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
          canChooseBranch={canChooseBranch}
        />
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
                <th className={`${TH} text-right`}>Coupons</th>
                <th className={TH}>Validity</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">{q || status || validity || card || coupons || categoryId || departmentId ? "No cardholders match your filters." : "No cardholders yet."}</td></tr>
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
