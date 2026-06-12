import { redirect } from "next/navigation";

/** Account settings now live at /profile. */
export default function AccountPage() {
  redirect("/profile");
}
