import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { createVendorAction } from "../../actions";
import { VendorForm } from "../../vendor-form";

export default async function NewVendorPage() {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/settlements/vendors");

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <Link href="/settlements/vendors" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">← Vendors</Link>
        <h1 className="font-display text-2xl font-semibold text-ink">New vendor</h1>
      </div>
      <VendorForm action={createVendorAction} />
    </div>
  );
}
