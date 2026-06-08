import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";

const PAGE_SIZE = 25;

function cardStatusDot(status: string) {
  if (status === "active") return "bg-sage";
  if (status === "blocked") return "bg-tomato";
  return "bg-muted-2"; // lost / retired
}

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "cards.view")) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.RfidCardWhereInput = {
    ...(actor.branchId ? { user: { branchId: BigInt(actor.branchId) } } : {}),
    ...(q
      ? {
          OR: [
            { cardUid: { contains: q, mode: "insensitive" } },
            { user: { fullName: { contains: q, mode: "insensitive" } } },
            { user: { code: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [cards, total] = await Promise.all([
    prisma.rfidCard.findMany({
      where,
      include: { user: { include: { category: true } } },
      orderBy: [{ status: "asc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.rfidCard.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">RFID Cards</h1>
        <p className="mt-1 text-sm text-ink-2">
          {total} card{total === 1 ? "" : "s"}. Issue, replace, and block cards from a cardholder&rsquo;s page.
        </p>
      </div>

      <form method="get" className="flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by card UID, cardholder name or id…"
          className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        />
        <button type="submit" className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Search
        </button>
        {q ? (
          <Link href="/cards" className="rounded-sm px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink-2">Clear</Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Card UID</th>
              <th className="px-4 py-3 font-semibold">Cardholder</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Issued</th>
              <th className="px-4 py-3 font-semibold">Expires</th>
              <th className="px-4 py-3 text-right font-semibold">Manage</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-2">{q ? "No cards match your search." : "No cards issued yet."}</td></tr>
            ) : (
              cards.map((c) => (
                <tr key={c.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{c.cardUid}</td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${c.userId}`} className="text-ink transition-colors hover:text-gold-deep">{c.user.fullName}</Link>
                    <span className="ml-1 font-mono text-xs text-muted">{c.user.code}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{c.user.category.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${cardStatusDot(c.status)}`} />
                      {c.status[0].toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{fmtDate(c.issuedAt)}</td>
                  <td className="px-4 py-3 text-ink-2">{fmtDate(c.expiresOn)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/users/${c.userId}`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Manage</Link>
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
            {page > 1 ? <Link href={qs(page - 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Previous</Link> : null}
            {page < totalPages ? <Link href={qs(page + 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Next</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
