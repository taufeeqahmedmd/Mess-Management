import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { SETTINGS_TABS } from "./tabs";

/** /settings has no content of its own — open the first accessible tab. */
export default async function SettingsPage() {
  const actor = await requireActor();
  const first = SETTINGS_TABS.find((t) => can(actor, t.permission));
  redirect(first ? first.href : "/dashboard");
}
