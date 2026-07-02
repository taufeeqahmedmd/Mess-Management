import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { updateVendorAction } from "../../actions";
import { VendorForm, type VendorData } from "../../vendor-form";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/settings/vendors");

  const { id } = await params;
  let vendorId: bigint;
  try {
    vendorId = BigInt(id);
  } catch {
    notFound();
  }

  const v = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!v) notFound();

  const vendor: VendorData = {
    id: v.id.toString(),
    code: v.code,
    name: v.name,
    gstin: v.gstin ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
    address: v.address ?? "",
    bankName: v.bankName ?? "",
    bankAccountName: v.bankAccountName ?? "",
    bankAccountNumber: v.bankAccountNumber ?? "",
    bankIfsc: v.bankIfsc ?? "",
    notes: v.notes ?? "",
    status: v.status === "active" ? "active" : "inactive",
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-muted-2">
        <Link href="/settings/vendors" className="hover:text-gold-deep">Vendors</Link> / {v.name}
      </p>
      <VendorForm action={updateVendorAction} vendor={vendor} />
    </div>
  );
}
