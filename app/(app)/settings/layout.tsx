import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { SETTINGS_TABS } from "./tabs";
import { SettingsTabs } from "./settings-tabs";

/**
 * Configurations shell: full-width header + a tab bar over all /settings
 * sections. Each section route renders below; only the active section's data
 * loads. Tabs are filtered to what the actor can access.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  const tabs = SETTINGS_TABS.filter((t) => can(actor, t.permission)).map((t) => ({
    href: t.href,
    label: t.label,
  }));

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Configurations</h1>
        <p className="mt-1 text-sm text-ink-2">Master data for the cafeteria.</p>
      </div>

      {tabs.length > 0 ? <SettingsTabs tabs={tabs} /> : null}

      <div className="min-w-0">{children}</div>
    </div>
  );
}
