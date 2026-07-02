import { redirect } from "next/navigation";

// Moved to Settings → Vendors.
export default function NewVendorMovedPage() {
  redirect("/settings/vendors/new");
}
