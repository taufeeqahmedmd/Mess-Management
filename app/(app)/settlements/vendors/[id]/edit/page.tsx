import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { updateVendorAction } from "../../../actions";
import { VendorForm } from "../../../vendor-form";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/settlements/vendors");

  const { id: idStr } = await params;
  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    notFound();
  }

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) notFound();

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <Link href="/settlements/vendors" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">← Vendors</Link>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit vendor</h1>
      </div>
      <VendorForm
        action={updateVendorAction}
        vendor={{
          id: vendor.id.toString(),
          code: vendor.code,
          name: vendor.name,
          gstin: vendor.gstin ?? "",
          status: vendor.status === "active" ? "active" : "inactive",
        }}
      />
    </div>
  );
}
