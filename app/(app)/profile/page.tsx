import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { BTN_GHOST } from "@/components/ui/controls";
import { ChangePasswordForm } from "../account/change-password-form";
import { ProfileDetailsForm } from "./profile-details-form";
import { PushToggle } from "@/components/pwa/push-toggle";

const IB_LAB = "mb-2.5 flex items-center gap-[7px] text-[10px] font-bold uppercase tracking-[0.08em] text-muted-2 [&_svg]:size-[13px] [&_svg]:shrink-0";
const TAG = "rounded-pill border border-line bg-surface-2 px-2.5 py-[3px] text-[11.5px] text-muted";

function SgIco({ tint = "gold", children }: { tint?: "gold" | "navy"; children: React.ReactNode }) {
  const cls = tint === "navy" ? "bg-navy-soft text-navy-text" : "bg-gold-soft-2 text-gold-deep";
  return <span className={`grid size-9 shrink-0 place-items-center rounded-[11px] [&_svg]:size-[18px] ${cls}`}>{children}</span>;
}

const HEAD = "flex items-center gap-3.5 px-5 pb-3.5 pt-[18px]";
const BODY = "px-5 pb-[18px] pt-1";

function SectionHead({ icon, title, sub, badge }: { icon: React.ReactNode; title: string; sub: string; badge?: React.ReactNode }) {
  return (
    <>
      {icon}
      <div className="min-w-0">
        <h2 className="font-display text-[15.5px] font-bold tracking-[-0.2px] text-ink">{title}</h2>
        <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
      </div>
      {badge ? <div className="ml-auto">{badge}</div> : null}
    </>
  );
}

/** Collapsible settings card (native <details>, closed by default). */
function CollapsibleSection({ icon, title, sub, badge, children }: { icon: React.ReactNode; title: string; sub: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-[18px] border border-line bg-surface shadow-sm">
      <summary className={`${HEAD} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <SectionHead icon={icon} title={title} sub={sub} badge={badge} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${badge ? "" : "ml-auto"} size-4 shrink-0 text-muted-2 transition-transform group-open:rotate-180`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={BODY}>{children}</div>
    </details>
  );
}

export default async function ProfilePage() {
  const actor = await requireActor();
  const id = BigInt(actor.id);

  const [me, operators, allBranches] = await Promise.all([
    prisma.appUser.findUnique({ where: { id }, include: { role: true, branch: true } }),
    prisma.counterOperator.findMany({ where: { appUserId: id }, include: { counter: { select: { name: true, code: true } } } }),
    actor.branchId ? Promise.resolve([]) : prisma.branch.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!me) redirect("/login");

  const initials = me.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  const isSuper = actor.isSuperAdmin || me.role.name === "Super Admin";
  const statusLabel = me.status === "active" ? "Active" : me.status === "locked" ? "Locked" : "Disabled";
  const branches = actor.branchId ? (me.branch ? [me.branch.name] : []) : allBranches.map((b) => b.name);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-6 sm:px-7">
      <h1 className="sr-only">Your profile</h1>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[340px_1fr]">
        {/* ===== Identity rail ===== */}
        <aside className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-sm lg:sticky lg:top-[88px]">
          <div className="relative h-[84px] bg-[linear-gradient(120deg,var(--gold-soft-2)_0%,var(--gold-soft)_60%,var(--sage-soft)_130%)] after:absolute after:inset-0 after:bg-[radial-gradient(120%_140%_at_80%_-10%,rgba(255,255,255,.35),transparent_60%)] after:content-['']" />

          <div className="relative z-[1] -mt-10 px-[22px] pb-[22px]">
            <span className="grid size-20 place-items-center overflow-hidden rounded-[24px] border-[3px] border-surface bg-[linear-gradient(140deg,var(--navy),#2A4BB0)] font-display text-[28px] font-bold text-white shadow-sm">
              {initials}
            </span>
            <div className="mt-3.5 font-display text-[20px] font-bold tracking-[-0.3px] text-ink">{me.name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy-soft px-[11px] py-1 text-[11.5px] font-semibold text-navy-text">
                {isSuper ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-[11px]" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                ) : null}
                {me.role.name}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-pill px-[11px] py-1 text-[11.5px] font-semibold ${me.status === "active" ? "border border-sage-soft-2 bg-sage-soft text-sage-deep" : "bg-tomato-soft text-tomato"}`}>
                <span className={`size-1.5 rounded-full ${me.status === "active" ? "bg-sage shadow-[0_0_0_3px_color-mix(in_srgb,var(--sage)_25%,transparent)]" : "bg-tomato"}`} />
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Contact */}
          <div className="px-[22px] pb-4">
            <div className={IB_LAB}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              Contact
            </div>
            <div className="flex items-center gap-[9px] py-[3px] text-[13px] text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="size-[15px] shrink-0 text-muted-2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              <span className="truncate">{me.email ?? "—"}</span>
            </div>
            <div className="mt-[7px] flex items-center gap-[9px] py-[3px] text-[13px] text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="size-[15px] shrink-0 text-muted-2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" /></svg>
              <span className="font-mono text-[12.5px]">{me.mobile}</span>
            </div>
          </div>

          {/* Branches */}
          <div className="border-t border-line px-[22px] py-4">
            <div className={IB_LAB}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6" /></svg>
              {actor.branchId ? "Branch" : "Branches"}
            </div>
            {branches.length === 0 ? (
              <span className="text-[12.5px] text-muted">All branches</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">{branches.map((b) => <span key={b} className={TAG}>{b}</span>)}</div>
            )}
          </div>

          {/* Assigned counters */}
          <div className="border-t border-line px-[22px] py-4">
            <div className={IB_LAB}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 18h18M8 22h8" /></svg>
              Assigned counters
            </div>
            {operators.length === 0 ? (
              <span className="text-[12.5px] text-muted">None assigned</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">{operators.map((o) => <span key={o.counterId.toString()} className={TAG}>{o.counter.name} · <span className="font-mono">{o.counter.code}</span></span>)}</div>
            )}
          </div>

          <div className="border-t border-line bg-surface-2 px-[22px] py-3.5 text-[11px] leading-relaxed text-muted-2">
            Role, branches and counters are managed by an administrator.
          </div>
        </aside>

        {/* ===== Settings column ===== */}
        <div className="flex flex-col gap-3.5">
          {/* Personal details */}
          <section className="rounded-[18px] border border-line bg-surface shadow-sm">
            <div className={HEAD}>
              <SectionHead
                icon={<SgIco><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg></SgIco>}
                title="Personal details"
                sub="Your name and contact email."
              />
            </div>
            <div className={BODY}><ProfileDetailsForm name={me.name} email={me.email ?? ""} /></div>
          </section>

          {/* Mobile number */}
          <section className="rounded-[18px] border border-line bg-surface shadow-sm">
            <div className={HEAD}>
              <SectionHead
                icon={<SgIco><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg></SgIco>}
                title="Mobile number"
                sub="Used to sign in. Changing it needs an administrator."
              />
            </div>
            <div className={BODY}>
              <label htmlFor="profileMobile" className="mb-[7px] flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">
                Mobile number
                <span className="inline-flex items-center gap-1 rounded-pill border border-sage-soft-2 bg-sage-soft px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-sage-deep">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="size-2.5" aria-hidden="true"><path d="M5 13l4 4 10-10" /></svg>Verified
                </span>
              </label>
              <div className="flex gap-2">
                <input id="profileMobile" value={me.mobile} readOnly aria-readonly className="flex-1 cursor-not-allowed rounded-[11px] border border-line-strong bg-surface-2 px-3 py-[11px] font-mono text-[13.5px] text-muted" />
                <button type="button" disabled title="Mobile changes are managed by an administrator" className={`${BTN_GHOST} shrink-0 cursor-not-allowed`}>Send code</button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-2">This is your sign-in handle — contact an administrator to change it.</p>
            </div>
          </section>

          {/* Password — collapsible */}
          <CollapsibleSection
            icon={<SgIco><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></SgIco>}
            title="Password"
            sub="Verify your current password, then set a new one."
          >
            <ChangePasswordForm />
          </CollapsibleSection>

          {/* Notifications — collapsible */}
          <CollapsibleSection
            icon={<SgIco tint="navy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></SgIco>}
            title="Notifications"
            sub="How we reach you."
          >
            <div className="py-3">
              {process.env.VAPID_PUBLIC_KEY ? (
                <PushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY} />
              ) : (
                <p className="rounded-sm border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-muted-2">
                  Push notifications aren&rsquo;t enabled on this server yet (VAPID keys pending).
                  Which events notify whom is configured in Notifications Management.
                </p>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
