import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, type CardEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatDateTimeInZone } from "@/lib/time";
import { Pager } from "@/components/ui/pager";
import { BTN_PRIMARY, INPUT_FIND, PANEL, TH, TD, clampPageSize } from "@/components/ui/controls";
import { ArrowRightGlyph } from "@/components/ui/glyphs";

// view → which card-event types to show. Default is the replacement log.
const VIEWS: Record<string, { label: string; types?: CardEventType[] }> = {
  replaced: { label: "Replacements", types: ["replace"] },
  issued: { label: "Issued", types: ["issue"] },
  all: { label: "All events" },
};

// DB event type → pill styling (bg/text) + status dot + label.
const EVENT_META: Record<string, { label: string; pill: string; dot: string }> = {
  replace: { label: "Replaced", pill: "bg-gold-soft text-gold-deep", dot: "bg-gold" },
  issue: { label: "Issued", pill: "bg-sage-soft text-sage-deep", dot: "bg-sage" },
  activate: { label: "Activated", pill: "bg-navy-soft text-navy-text", dot: "bg-navy" },
  deactivate: { label: "Deactivated", pill: "bg-tomato-soft text-tomato", dot: "bg-tomato" },
  lost: { label: "Lost", pill: "bg-tomato-soft text-tomato", dot: "bg-tomato" },
  retire: { label: "Retired", pill: "bg-surface-2 text-muted", dot: "bg-muted-2" },
};

const UID_CHIP = "inline-flex items-center rounded-[7px] border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[12px] tracking-[0.3px]";

function CardGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-[22px]" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </svg>
  );
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "cards.view")) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const view = sp.view && VIEWS[sp.view] ? sp.view : "replaced";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);

  const branchScope = actor.branchId ? { user: { branchId: BigInt(actor.branchId) } } : {};
  const types = VIEWS[view].types;
  const where: Prisma.CardEventWhereInput = {
    ...(types ? { type: { in: types } } : {}),
    ...branchScope,
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

  const [events, total, countReplaced, countIssued, countAll] = await Promise.all([
    prisma.cardEvent.findMany({
      where,
      include: { user: { include: { category: true } }, appUser: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cardEvent.count({ where }),
    prisma.cardEvent.count({ where: { type: { in: ["replace"] }, ...branchScope } }),
    prisma.cardEvent.count({ where: { type: { in: ["issue"] }, ...branchScope } }),
    prisma.cardEvent.count({ where: branchScope }),
  ]);

  const counts: Record<string, number> = { replaced: countReplaced, issued: countIssued, all: countAll };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Card History</h1>
        <p className="mt-1 text-[13px] text-muted">
          Replacements and lifecycle events for RFID cards. Issue, replace, or block a card from a
          cardholder&rsquo;s page.
        </p>
      </div>

      {/* Tabs with count badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(VIEWS).map(([key, v]) => {
          const active = key === view;
          return (
            <Link
              key={key}
              href={`/cards?${new URLSearchParams({ ...(q ? { q } : {}), view: key })}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-[13px] transition-colors ${
                active
                  ? "border-gold-soft-2 bg-gold-soft-2 font-semibold text-gold-deep"
                  : "border-transparent text-muted hover:bg-gold-soft hover:text-gold-deep"
              }`}
            >
              {v.label}
              <span
                className={`rounded-pill border px-2 text-[10.5px] font-bold tabular-nums ${
                  active ? "border-gold-soft-2 text-gold-deep" : "border-line-strong text-muted"
                }`}
              >
                {counts[key]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <div className={`${PANEL} p-[18px_20px]`}>
        <form method="get" className="flex flex-col gap-2.5 sm:flex-row">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} placeholder="Search by card UID, cardholder name or id…" className={`${INPUT_FIND} sm:max-w-[420px]`} />
          <button type="submit" className={BTN_PRIMARY}>Search</button>
          {q ? (
            <Link href={`/cards?view=${view}`} className="inline-flex items-center px-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-gold-deep">Clear</Link>
          ) : null}
        </form>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>When</th>
                <th className={TH}>Cardholder</th>
                <th className={TH}>Event</th>
                <th className={TH}>Card change</th>
                <th className={TH}>Reason</th>
                <th className={TH}>By</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-11 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
                      <span className="grid size-[46px] place-items-center rounded-md border border-line bg-surface-2 text-muted-2">
                        <CardGlyph />
                      </span>
                      <p className="text-[13.5px] font-semibold text-muted">
                        {q ? "No events match your search." : `No ${VIEWS[view].label.toLowerCase()} yet.`}
                      </p>
                      <p className="text-[12px] text-muted-2">
                        {q
                          ? "Try a different card UID, name, or id."
                          : "Issue, replace, or block a card from a cardholder’s page and it will appear here."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                events.map((e) => {
                  const meta = EVENT_META[e.type] ?? { label: e.type, pill: "bg-surface-2 text-muted", dot: "bg-muted-2" };
                  const dt = formatDateTimeInZone(e.createdAt); // "YYYY-MM-DD HH:mm" in IST
                  const date = dt.slice(0, 10);
                  const time = dt.slice(11);
                  return (
                    <tr key={e.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap text-muted`}>
                        <div>{date}</div>
                        <div className="text-[11.5px] text-muted-2">{time}</div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${e.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">
                          {e.user.fullName}
                        </Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{e.user.code}</span>
                      </td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-semibold ${meta.pill}`}>
                          <span className={`size-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className={TD}>
                        {e.oldUid || e.newUid ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            {e.oldUid ? <span className={`${UID_CHIP} text-muted-2 line-through`}>{e.oldUid}</span> : null}
                            {e.oldUid && e.newUid ? <ArrowRightGlyph className="size-[13px] text-muted-2" /> : null}
                            {e.newUid ? <span className={`${UID_CHIP} text-muted`}>{e.newUid}</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-2">—</span>
                        )}
                      </td>
                      <td className={`${TD} max-w-[260px] text-muted`}>{e.reason ?? "—"}</td>
                      <td className={`${TD} whitespace-nowrap text-muted`}>{e.appUser?.name ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
}
