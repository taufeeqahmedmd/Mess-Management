import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can, type Permission } from "@/lib/rbac";
import { ConsumptionReport } from "./consumption-report";
import { BalanceReport } from "./balance-report";
import { AuditReport } from "./audit-report";
import { FoodRequestReport } from "./food-request-report";
import { RechargeReport } from "./recharge-report";

// Each tab is gated by its own permission — recharge management lives here now,
// so a recharge-only user reaches it via this shell too.
const ALL_TABS = [
  { key: "consumption", label: "Consumption report", perm: "reports.view" },
  { key: "foodRequests", label: "Food requests", perm: "reports.view" },
  { key: "recharges", label: "Recharges", perm: "recharge.view" },
  { key: "balances", label: "Balance report", perm: "reports.view" },
  { key: "audit", label: "Audit log", perm: "reports.view" },
] as const satisfies readonly { key: string; label: string; perm: Permission }[];

type TabKey = (typeof ALL_TABS)[number]["key"];

type ReportSearchParams = {
  tab?: string;
  q?: string;
  from?: string;
  to?: string;
  meal?: string;
  counter?: string;
  category?: string;
  paidBy?: string;
  entity?: string;
  kind?: string;
  page?: string;
  size?: string;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const actor = await requireActor();
  const tabs = ALL_TABS.filter((t) => can(actor, t.perm));
  if (tabs.length === 0) redirect("/dashboard");

  const sp = await searchParams;
  const tab: TabKey = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0].key;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Reports</h1>
        <p className="mt-1 text-[13px] text-muted">Consumption, recharges, balances, and the audit trail.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-px">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-pill px-4 py-2 text-[13px] font-medium transition-colors ${
                active ? "bg-gold-soft-2 font-semibold text-gold-deep" : "text-muted hover:bg-gold-soft hover:text-gold-deep"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "consumption" ? (
        <ConsumptionReport actor={actor} sp={sp} />
      ) : tab === "foodRequests" ? (
        <FoodRequestReport actor={actor} sp={sp} />
      ) : tab === "recharges" ? (
        <RechargeReport actor={actor} sp={sp} />
      ) : tab === "balances" ? (
        <BalanceReport actor={actor} sp={sp} />
      ) : (
        <AuditReport actor={actor} sp={sp} />
      )}
    </div>
  );
}
