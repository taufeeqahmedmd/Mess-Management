import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { setUserStatusAction } from "./actions";

const PAGE_SIZE = 25;

function statusDot(status: string) {
  if (status === "active") return "bg-sage";
  if (status === "suspended") return "bg-tomato";
  return "bg-muted-2";
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "users.view")) redirect("/dashboard");
  const canEdit = can(actor, "users.edit");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

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

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { category: true, wallet: true, cards: { where: { status: "active" }, take: 1 } },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Cardholders</h1>
          <p className="mt-1 text-sm text-ink-2">{total} cardholder{total === 1 ? "" : "s"}.</p>
        </div>
        {can(actor, "users.create") ? (
          <Link href="/users/new" className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
            Add cardholder
          </Link>
        ) : null}
      </div>

      <form method="get" className="flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by id, name, phone, email, card UID…"
          className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        />
        <button type="submit" className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Search
        </button>
        {q ? (
          <Link href="/users" className="rounded-sm px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink-2">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Identifier</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Card UID</th>
              <th className="px-4 py-3 text-right font-semibold">Wallet</th>
              <th className="px-4 py-3 font-semibold">Validity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-2">{q ? "No cardholders match your search." : "No cardholders yet."}</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{u.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="text-ink transition-colors hover:text-gold-deep">
                      {u.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{u.category.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{u.cards[0]?.cardUid ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">₹{(u.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2)}</td>
                  <td className="px-4 py-3 text-ink-2">{u.cardExpiryDate ? u.cardExpiryDate.toISOString().slice(0, 10) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${statusDot(u.status)}`} />
                      {u.status === "active" ? "Active" : u.status === "suspended" ? "Blocked" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit ? (
                        <>
                          <Link href={`/users/${u.id}/edit`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Edit</Link>
                          <form action={setUserStatusAction}>
                            <input type="hidden" name="id" value={u.id.toString()} />
                            <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                            <button type="submit" className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep">
                              {u.status === "active" ? "Block" : "Unblock"}
                            </button>
                          </form>
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

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={qs(page - 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">Previous</Link>
            ) : null}
            {page < totalPages ? (
              <Link href={qs(page + 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">Next</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
