import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";

const REPORTS = [
  {
    href: "/reports/consumption",
    title: "Consumption report",
    desc: "Every tap with meal, counter, payment method, sale, vendor cost and P/L. Filter by date, meal, counter, category. Export CSV.",
  },
  {
    href: "/reports/balances",
    title: "Balance report",
    desc: "Each cardholder's wallet balance and per-meal coupon counts, with branch totals. Export CSV.",
  },
  {
    href: "/reports/audit",
    title: "Audit log",
    desc: "Who changed what, when — every state change with before/after, actor and time.",
  },
] as const;

export default async function ReportsPage() {
  const actor = await requireActor();
  if (!can(actor, "reports.view")) redirect("/dashboard");

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink-2">Consumption, balances, and the audit trail.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex flex-col gap-2 rounded-md border border-line bg-surface p-5 shadow-sm transition-colors hover:border-gold"
          >
            <h2 className="font-display text-lg font-semibold text-ink group-hover:text-gold-deep">
              {r.title}
            </h2>
            <p className="text-sm text-ink-2">{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
