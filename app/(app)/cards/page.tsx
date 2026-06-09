import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, type CardEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";

const PAGE_SIZE = 25;

// view → which card-event types to show. Default is the replacement log.
const VIEWS: Record<string, { label: string; types?: CardEventType[] }> = {
  replaced: { label: "Replacements", types: ["replace"] },
  issued: { label: "Issued", types: ["issue"] },
  all: { label: "All events" },
};

const EVENT_META: Record<string, { label: string; dot: string }> = {
  replace: { label: "Replaced", dot: "bg-gold" },
  issue: { label: "Issued", dot: "bg-sage" },
  activate: { label: "Activated", dot: "bg-sage" },
  deactivate: { label: "Deactivated", dot: "bg-muted-2" },
  lost: { label: "Lost", dot: "bg-tomato" },
  retire: { label: "Retired", dot: "bg-muted-2" },
};

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "cards.view")) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const view = sp.view && VIEWS[sp.view] ? sp.view : "replaced";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const types = VIEWS[view].types;
  const where: Prisma.CardEventWhereInput = {
    ...(types ? { type: { in: types } } : {}),
    ...(actor.branchId ? { user: { branchId: BigInt(actor.branchId) } } : {}),
    ...(q
      ? {
          OR: [
            { oldUid: { contains: q, mode: "insensitive" } },
            { newUid: { contains: q, mode: "insensitive" } },
            { user: { fullName: { contains: q, mode: "insensitive" } } },
            { user: { code: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    prisma.cardEvent.findMany({
      where,
      include: { user: { include: { category: true } }, appUser: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.cardEvent.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ ...(q ? { q } : {}), view, ...extra })}`;

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Card History</h1>
        <p className="mt-1 text-sm text-ink-2">
          Replacements and lifecycle events for RFID cards. Issue, replace, or block a card from a
          cardholder&rsquo;s page.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(VIEWS).map(([key, v]) => {
          const active = key === view;
          return (
            <Link
              key={key}
              href={`/cards?${new URLSearchParams({ ...(q ? { q } : {}), view: key })}`}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10 hover:text-gold-deep"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      <form method="get" className="flex max-w-md gap-2">
        <input type="hidden" name="view" value={view} />
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
          <Link href={`/cards?view=${view}`} className="rounded-sm px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink-2">Clear</Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Cardholder</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Card change</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">By</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-2">
                  {q ? "No card events match your search." : `No ${VIEWS[view].label.toLowerCase()} yet.`}
                </td>
              </tr>
            ) : (
              events.map((e) => {
                const meta = EVENT_META[e.type] ?? { label: e.type, dot: "bg-muted-2" };
                return (
                  <tr key={e.id.toString()} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/users/${e.userId}`} className="text-ink transition-colors hover:text-gold-deep">
                        {e.user.fullName}
                      </Link>
                      <span className="ml-1 font-mono text-xs text-muted">{e.user.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <span className={`size-2 rounded-pill ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {e.oldUid ? <span className="text-muted line-through">{e.oldUid}</span> : null}
                      {e.oldUid && e.newUid ? <span className="px-1 text-muted-2">→</span> : null}
                      {e.newUid ? <span className="text-ink">{e.newUid}</span> : null}
                      {!e.oldUid && !e.newUid ? <span className="text-muted-2">—</span> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{e.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{e.appUser?.name ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Previous</Link> : null}
            {page < totalPages ? <Link href={qs({ page: String(page + 1) })} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Next</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
