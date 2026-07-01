import { redirect } from "next/navigation";

// Vendor management moved to Settings → Vendors. Keep this route as a redirect
// so existing links/bookmarks still land in the right place.
export default function VendorsMovedPage() {
  redirect("/settings/vendors");
}
