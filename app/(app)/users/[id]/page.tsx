import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { inr } from "@/lib/format";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/time";
import { BTN_GHOST, BTN_PRIMARY, TH, TD, LINK_ACT_DANGER, LINK_ACT_SAGE } from "@/components/ui/controls";
import { mealColorMap } from "@/services/reporting";
import { mealTint } from "@/lib/meal-colors";
import { IssueCardForm, ReplaceCardForm } from "./card-forms";
import { setCardStatusAction } from "./card-actions";
import { RfidCardPanel } from "./rfid-card-panel";
import { ActivityTabs } from "./activity-tabs";
import { RechargeDrawer } from "../../recharge/edit-drawer";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const fmtDate = (d: Date | null) => (d ? formatDateInZone(d) : "—");
const fmtDateTime = (d: Date) => formatDateTimeInZone(d);

const CARD_DOT: Record<string, string> = { active: "bg-sage", blocked: "bg-tomato" };
const RECHARGE_DOT: Record<string, { dot: string; text: string }> = {
  posted: { dot: "bg-sage", text: "text-sage-deep" },
  reversed: { dot: "bg-tomato", text: "text-tomato" },
  expired: { dot: "bg-muted-2", text: "text-muted" },
};

// Card-event → timeline dot styling + verb.
const EVENT_TL: Record<string, { tile: string; verb: string }> = {
  issue: { tile: "bg-sage-soft-2 text-sage-deep", verb: "Card issued" },
  activate: { tile: "bg-sage-soft-2 text-sage-deep", verb: "Card activated" },
  replace: { tile: "bg-gold-soft-2 text-gold-deep", verb: "Card replaced" },
  deactivate: { tile: "bg-tomato-soft text-tomato", verb: "Card deactivated" },
  lost: { tile: "bg-tomato-soft text-tomato", verb: "Card reported lost" },
  retire: { tile: "bg-surface-2 text-muted", verb: "Card retired" },
};

function CouponGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-[17px]" aria-hidden="true">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M15 6v12" />
    </svg>
  );
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "users.view")) redirect("/dashboard");

  const { id } = await params;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    notFound();
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      category: true,
      branch: true,
      wallet: true,
      cards: { orderBy: { id: "desc" } },
      cardEvents: { orderBy: { id: "desc" }, take: 30, include: { appUser: true } },
      couponBalances: { include: { mealType: true }, orderBy: { mealTypeId: "asc" } },
      recharges: {
        orderBy: { id: "desc" },
        take: 100,
        include: { paymentMode: true, appUser: true, coupons: { include: { mealType: true } } },
      },
      redemptions: { orderBy: { redeemedAt: "desc" }, take: 100, include: { mealType: true, counter: true } },
    },
  });
  if (!u || u.deletedAt) notFound();
  if (actor.branchId && u.branchId.toString() !== actor.branchId) redirect("/users");

  const mealColors = await mealColorMap(prisma);
  const activeCard = u.cards.find((c) => c.status === "active") ?? null;
  const canEdit = can(actor, "users.edit");
  const canReplace = can(actor, "cards.replace");
  const canActivate = can(actor, "cards.activate");
  const canDeactivate = can(actor, "cards.deactivate");
  const initials = u.fullName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  const statusLabel = u.status === "active" ? "Active" : u.status === "suspended" ? "Blocked" : "Inactive";
  const couponRows = u.couponBalances;

  // ---- Activity panes (server-rendered, handed to the client tab shell) ----
  const rechargesPane =
    u.recharges.length === 0 ? (
      <p className="px-5 py-10 text-center text-sm text-muted">No recharges yet.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th className={TH}>Date</th>
              <th className={`${TH} text-right`}>Value</th>
              <th className={TH}>Coupons</th>
              <th className={TH}>Mode</th>
              <th className={TH}>Status</th>
              <th className={TH}>By</th>
            </tr>
          </thead>
          <tbody>
            {u.recharges.map((r) => {
              const tags = r.coupons.filter((c) => c.count > 0);
              const st = RECHARGE_DOT[r.status] ?? RECHARGE_DOT.expired;
              return (
                <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                  <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] text-muted`}>
                    <Link href={`/recharge/${r.id}`} className="transition-colors hover:text-gold-deep">{fmtDate(r.rechargedAt)}</Link>
                  </td>
                  <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.amount)}</td>
                  <td className={TD}>
                    {tags.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {tags.map((c) => (
                          <span key={c.id.toString()} className="rounded-[6px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{c.mealType.code}×{c.count}</span>
                        ))}
                      </span>
                    ) : "—"}
                  </td>
                  <td className={`${TD} text-ink-2`}>{r.paymentMode.name}</td>
                  <td className={TD}>
                    <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${st.text}`}>
                      <span className={`size-[7px] rounded-full ${st.dot}`} />{cap(r.status)}
                    </span>
                  </td>
                  <td className={`${TD} text-muted`}>{r.appUser?.name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const mealsPane =
    u.redemptions.length === 0 ? (
      <p className="px-5 py-10 text-center text-sm text-muted">No meals taken yet.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th className={TH}>When</th>
              <th className={TH}>Meal</th>
              <th className={TH}>Counter</th>
              <th className={TH}>Paid by</th>
              <th className={`${TH} text-right`}>Charged</th>
            </tr>
          </thead>
          <tbody>
            {u.redemptions.map((d) => (
              <tr key={d.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] text-muted`}>{fmtDateTime(d.redeemedAt)}</td>
                <td className={`${TD} text-ink`}>{d.mealType.name}</td>
                <td className={`${TD} text-muted`}>{d.counter.name}</td>
                <td className={TD}>
                  <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${d.paidBy === "coupon" ? "text-gold-deep" : "text-navy-text"}`}>
                    <span className={`size-[7px] rounded-full ${d.paidBy === "coupon" ? "bg-gold" : "bg-navy"}`} />{d.paidBy ? cap(d.paidBy) : "—"}
                  </span>
                </td>
                <td className={`${TD} text-right font-mono text-ink-2`}>{inr(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const cardsPane =
    u.cardEvents.length === 0 ? (
      <p className="px-5 py-10 text-center text-sm text-muted">No card events yet.</p>
    ) : (
      <div className="px-5 py-5">
        {u.cardEvents.map((e, i) => {
          const meta = EVENT_TL[e.type] ?? { tile: "bg-surface-2 text-muted", verb: cap(e.type) };
          const uid = e.newUid ?? e.oldUid;
          const last = i === u.cardEvents.length - 1;
          return (
            <div key={e.id.toString()} className="relative flex gap-3.5 pb-[18px] last:pb-0">
              {!last ? <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" /> : null}
              <span className={`z-[1] grid size-8 shrink-0 place-items-center rounded-[10px] ${meta.tile}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
              </span>
              <div className="min-w-0 pt-1">
                <div className="text-[13.5px] font-semibold text-ink">
                  {meta.verb}
                  {uid ? <span className="ml-1.5 font-mono text-[12.5px] text-muted">{uid}</span> : null}
                  {e.reason ? <span className="font-normal text-muted"> · {e.reason}</span> : null}
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted-2">{e.appUser?.name ? `${e.appUser.name} · ` : ""}{fmtDateTime(e.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );

  // ---- Cards table for the RFID panel ----
  const cardsTable =
    u.cards.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th className={TH}>Card UID</th>
              <th className={TH}>Status</th>
              <th className={TH}>Issued</th>
              <th className={TH}>Expires</th>
              <th className={`${TH} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {u.cards.map((c) => (
              <tr key={c.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                <td className={`${TD} font-mono text-ink`}>{c.cardUid}</td>
                <td className={TD}>
                  <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${c.status === "active" ? "text-sage-deep" : c.status === "blocked" ? "text-tomato" : "text-muted"}`}>
                    <span className={`size-[7px] rounded-full ${CARD_DOT[c.status] ?? "bg-muted-2"}`} />{cap(c.status)}
                  </span>
                </td>
                <td className={`${TD} font-mono text-muted`}>{fmtDate(c.issuedAt)}</td>
                <td className={`${TD} text-muted`}>{fmtDate(c.expiresOn)}</td>
                <td className={`${TD} text-right`}>
                  {c.status === "active" && canDeactivate ? (
                    <ConfirmActionForm
                      action={setCardStatusAction}
                      className="inline"
                      fields={{ cardId: c.id.toString(), action: "deactivate" }}
                      confirm={{ title: "Deactivate card", message: `Deactivate card ${c.cardUid}?`, confirmLabel: "Yes, deactivate", tone: "danger" }}
                      successMessage="Card deactivated."
                      buttonClassName={LINK_ACT_DANGER}
                    >
                      Deactivate
                    </ConfirmActionForm>
                  ) : c.status === "blocked" && canActivate && !activeCard ? (
                    <ConfirmActionForm
                      action={setCardStatusAction}
                      className="inline"
                      fields={{ cardId: c.id.toString(), action: "activate" }}
                      confirm={{ title: "Activate card", message: `Activate card ${c.cardUid}?`, confirmLabel: "Yes, activate" }}
                      successMessage="Card activated."
                      buttonClassName={LINK_ACT_SAGE}
                    >
                      Activate
                    </ConfirmActionForm>
                  ) : (
                    <span className="text-[12.5px] text-muted-2">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="px-5 py-8 text-center text-sm text-muted">No cards issued yet.</p>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <p className="text-[12px] text-muted-2">
        <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / {u.fullName}
      </p>

      {/* Hero */}
      <div className="flex flex-wrap items-center gap-4">
        {u.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external cardholder photo
          <img src={u.photoUrl} alt={`Photo of ${u.fullName}`} className="size-16 shrink-0 rounded-[18px] border border-line object-cover" />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-[18px] bg-[linear-gradient(135deg,var(--gold),var(--sage))] font-display text-2xl font-bold text-white">{initials}</span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-[-0.4px] text-ink">{u.fullName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-pill border border-line bg-surface-2 px-2.5 py-1 font-mono text-[12px] text-muted">{u.code}</span>
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-muted">
              <span className="size-1.5 rounded-full bg-gold" />{u.category.name}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium ${u.status === "active" ? "bg-sage-soft text-sage-deep" : u.status === "suspended" ? "bg-tomato-soft text-tomato" : "bg-surface-2 text-muted"}`}>
              <span className={`size-1.5 rounded-full ${u.status === "active" ? "bg-sage" : u.status === "suspended" ? "bg-tomato" : "bg-muted-2"}`} />{statusLabel}
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2.5">
          {can(actor, "recharge.create") ? (
            <button type="button" data-recharge-user={u.id.toString()} className={BTN_GHOST}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
              Recharge
            </button>
          ) : null}
          {canEdit ? (
            <Link href={`/users/${u.id}/edit`} className={BTN_PRIMARY}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit details
            </Link>
          ) : null}
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        <Fact label={u.category.identifierLabel} value={u.code} mono />
        <Fact label="Category" value={u.category.name} />
        <Fact label="Branch" value={u.branch.name} />
        <Fact label="Status" value={statusLabel} />
        <Fact label="Wallet" value={inr(u.wallet?.balanceAmount ?? new Prisma.Decimal(0))} big />
        <Fact label="Validity" value={fmtDate(u.cardExpiryDate)} mono />
        <Fact label="Phone" value={u.phone || "—"} mono={Boolean(u.phone)} dim={!u.phone} />
        <Fact label="Email" value={u.email || "—"} dim={!u.email} />
      </div>

      {/* Coupon balances */}
      <section className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          <span className="h-[17px] w-1 rounded-full bg-sage" />
          <div>
            <h2 className="font-display text-base font-bold text-ink">Coupon balances</h2>
            <p className="text-[12px] text-muted">Unredeemed coupons by meal.</p>
          </div>
        </div>
        <div className="p-5">
          {couponRows.length === 0 ? (
            <p className="text-sm text-muted">No meal coupons.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
              {couponRows.map((b) => {
                const color = mealColors[b.mealTypeId.toString()] ?? "var(--gold)";
                return (
                  <div key={b.id.toString()} className="rounded-[14px] border p-4" style={{ background: mealTint(color), borderColor: `color-mix(in srgb, ${color} 28%, var(--surface))` }}>
                    <span className="mb-3 grid size-8 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 22%, var(--surface))`, color }}>
                      <CouponGlyph />
                    </span>
                    <div className="font-display text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums" style={{ color }}>{b.count}</div>
                    <div className="mt-1.5 text-[12px] text-muted">{b.mealType.name} left</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* RFID card */}
      <RfidCardPanel
        activeCardUid={activeCard?.cardUid ?? null}
        issued={fmtDate(activeCard?.issuedAt ?? null)}
        hasActive={Boolean(activeCard)}
        canReplace={canReplace}
        form={canReplace ? (activeCard ? <ReplaceCardForm userId={u.id.toString()} /> : <IssueCardForm userId={u.id.toString()} />) : null}
        table={cardsTable}
      />

      {/* Activity */}
      <ActivityTabs
        counts={{ recharges: u.recharges.length, meals: u.redemptions.length, cards: u.cardEvents.length }}
        recharges={rechargesPane}
        meals={mealsPane}
        cards={cardsPane}
      />

      {can(actor, "recharge.create") ? <RechargeDrawer /> : null}
    </div>
  );
}

function Fact({ label, value, mono, big, dim }: { label: string; value: string; mono?: boolean; big?: boolean; dim?: boolean }) {
  return (
    <div className="bg-surface px-[18px] py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-2">{label}</p>
      <p className={`mt-1.5 font-semibold tabular-nums ${big ? "text-[19px] text-gold-deep" : "text-[15px]"} ${mono ? "font-mono !font-semibold text-ink" : ""} ${dim ? "font-normal text-muted-2" : "text-ink"}`}>{value}</p>
    </div>
  );
}
