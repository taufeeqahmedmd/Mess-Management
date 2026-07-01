import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConsumptionReport } from "./consumption-report";
import { BalanceReport } from "./balance-report";
import { AuditReport } from "./audit-report";
import { FoodRequestReport } from "./food-request-report";

const TABS = [
  { key: "consumption", label: "Consumption report" },
  { key: "foodRequests", label: "Food requests" },
  { key: "balances", label: "Balance report" },
  { key: "audit", label: "Audit log" },
] as const;

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
  if (!can(actor, "reports.view")) redirect("/dashboard");

  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]["key"]) : "consumption";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Reports</h1>
        <p className="mt-1 text-[13px] text-muted">Consumption, balances, and the audit trail.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-px">
        {TABS.map((t) => {
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
      ) : tab === "balances" ? (
        <BalanceReport actor={actor} sp={sp} />
      ) : (
        <AuditReport actor={actor} sp={sp} />
      )}
    </div>
  );
}
