import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { IssueCardForm, ReplaceCardForm } from "./card-forms";
import { setCardStatusAction } from "./card-actions";

function cardStatusDot(status: string) {
  if (status === "active") return "bg-sage";
  if (status === "blocked") return "bg-tomato";
  return "bg-muted-2";
}

function fmtDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    },
  });
  if (!u || u.deletedAt) notFound();
  if (actor.branchId && u.branchId.toString() !== actor.branchId) redirect("/users");

  const activeCard = u.cards.find((c) => c.status === "active") ?? null;
  const canReplace = can(actor, "cards.replace");
  const canActivate = can(actor, "cards.activate");
  const canDeactivate = can(actor, "cards.deactivate");

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            <Link href="/users" className="hover:text-gold-deep">Cardholders</Link> / {u.fullName}
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">{u.fullName}</h1>
        </div>
        {can(actor, "users.edit") ? (
          <Link href={`/users/${u.id}/edit`} className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
            Edit details
          </Link>
        ) : null}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 rounded-md border border-line bg-surface p-5 sm:grid-cols-4">
        <Field label={u.category.identifierLabel} value={u.code} mono />
        <Field label="Category" value={u.category.name} />
        <Field label="Branch" value={u.branch.name} />
        <Field label="Status" value={u.status === "active" ? "Active" : u.status === "suspended" ? "Blocked" : "Inactive"} />
        <Field label="Wallet" value={`₹${(u.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2)}`} mono />
        <Field label="Validity" value={fmtDate(u.cardExpiryDate)} />
        <Field label="Phone" value={u.phone ?? "—"} mono />
        <Field label="Email" value={u.email ?? "—"} />
      </div>

      {/* Cards */}
      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">RFID card</h2>
          <p className="mt-1 text-sm text-ink-2">
            {activeCard ? <>Active card <span className="font-mono text-ink">{activeCard.cardUid}</span>{activeCard.expiresOn ? <> · expires {fmtDate(activeCard.expiresOn)}</> : null}</> : "No active card."}
          </p>
        </div>

        {canReplace ? (
          <div className="rounded-md border border-line bg-surface-2 p-4">
            {activeCard ? <ReplaceCardForm userId={u.id.toString()} /> : <IssueCardForm userId={u.id.toString()} />}
          </div>
        ) : null}

        {u.cards.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5 font-semibold">Card UID</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Issued</th>
                  <th className="px-4 py-2.5 font-semibold">Expires</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {u.cards.map((c) => (
                  <tr key={c.id.toString()} className="border-t border-line">
                    <td className="px-4 py-2.5 font-mono text-ink">{c.cardUid}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <span className={`size-2 rounded-pill ${cardStatusDot(c.status)}`} />
                        {c.status[0].toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{fmtDate(c.issuedAt)}</td>
                    <td className="px-4 py-2.5 text-ink-2">{fmtDate(c.expiresOn)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {c.status === "active" && canDeactivate ? (
                        <ConfirmActionForm
                          action={setCardStatusAction}
                          className="inline"
                          fields={{ cardId: c.id.toString(), action: "deactivate" }}
                          confirm={{
                            title: "Deactivate card",
                            message: `Deactivate card ${c.cardUid}?`,
                            confirmLabel: "Yes, deactivate",
                            tone: "danger",
                          }}
                          successMessage="Card deactivated."
                          buttonClassName="rounded-sm px-2.5 py-1 text-xs font-medium text-tomato transition-colors hover:bg-tomato-soft disabled:opacity-60"
                        >
                          Deactivate
                        </ConfirmActionForm>
                      ) : c.status === "blocked" && canActivate && !activeCard ? (
                        <ConfirmActionForm
                          action={setCardStatusAction}
                          className="inline"
                          fields={{ cardId: c.id.toString(), action: "activate" }}
                          confirm={{
                            title: "Activate card",
                            message: `Activate card ${c.cardUid}?`,
                            confirmLabel: "Yes, activate",
                          }}
                          successMessage="Card activated."
                          buttonClassName="rounded-sm px-2.5 py-1 text-xs font-medium text-sage-deep transition-colors hover:bg-sage-soft disabled:opacity-60"
                        >
                          Activate
                        </ConfirmActionForm>
                      ) : (
                        <span className="text-xs text-muted-2">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* History */}
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Card history</h2>
        {u.cardEvents.length === 0 ? (
          <p className="text-sm text-ink-2">No card events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {u.cardEvents.map((e) => (
              <li key={e.id.toString()} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line pb-2.5 text-sm last:border-b-0 last:pb-0">
                <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">{e.type}</span>
                {e.oldUid ? <span className="font-mono text-muted">{e.oldUid}</span> : null}
                {e.oldUid && e.newUid ? <span className="text-muted">→</span> : null}
                {e.newUid ? <span className="font-mono text-ink">{e.newUid}</span> : null}
                {e.reason ? <span className="text-ink-2">· {e.reason}</span> : null}
                <span className="ml-auto text-xs text-muted">
                  {e.appUser?.name ? `${e.appUser.name} · ` : ""}{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className={`mt-0.5 text-ink ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
