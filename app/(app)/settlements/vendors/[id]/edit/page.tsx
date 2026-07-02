import { redirect } from "next/navigation";

// Moved to Settings → Vendors.
export default async function EditVendorMovedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/settings/vendors/${id}/edit`);
}
