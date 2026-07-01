import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { createVendorAction } from "../actions";
import { VendorForm } from "../vendor-form";

export default async function NewVendorPage() {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/settings/vendors");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-muted-2">
        <Link href="/settings/vendors" className="hover:text-gold-deep">Vendors</Link> / New
      </p>
      <VendorForm action={createVendorAction} />
    </div>
  );
}
