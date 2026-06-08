import { Header } from "@/components/shell/header";
import { StatCard } from "@/components/ui/stat-card";

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" />
      <div className="flex flex-col gap-6 p-6">
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cardholders" value="—" variant="plain" />
          <StatCard label="Taps today" value="—" variant="sage" />
          <StatCard label="Wallet balance" value="—" variant="gold" />
          <StatCard label="Coupons issued" value="—" variant="plain" />
        </section>

        <section className="rounded-md border border-line bg-surface-2 p-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Phase 0 — scaffold ready
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-2">
            Toolchain, theme tokens, app shell, and Prisma are wired up. KPIs are
            placeholders until the data layer lands in later phases (see{" "}
            <span className="font-mono text-ink">plan.md</span> §11).
          </p>
        </section>
      </div>
    </>
  );
}
