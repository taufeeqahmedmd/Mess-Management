import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RechargeImportForm } from "./import-form";

export default async function ImportRechargesPage() {
  const actor = await requireActor();
  if (!can(actor, "recharge.import")) redirect("/dashboard");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/recharge" className="hover:text-gold-deep">Recharge</Link> / Import
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Import recharges</h1>
        <p className="mt-1 text-sm text-ink-2">
          Bulk-apply recharges from a CSV. Each valid row grants a cardholder&rsquo;s meal coupons
          and records the recharge value; invalid rows are reported and skipped.{" "}
          <a href="/api/recharges/sample" className="font-medium text-gold-deep hover:underline">
            Download a sample template
          </a>
          .
        </p>
      </div>

      <RechargeImportForm />
    </div>
  );
}
