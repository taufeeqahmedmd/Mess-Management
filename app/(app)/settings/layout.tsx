import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { SETTINGS_TABS } from "./tabs";
import { SettingsTabs } from "./settings-tabs";
import { SettingsDrawer } from "./settings-drawer";

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

  // Email-entity options for the branch add/edit form in the drawer (mapping a
  // branch to its sending entity lives on the branch itself).
  const emailEntities = can(actor, "settings.manage")
    ? (await prisma.emailEntity.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, name: true } })).map(
        (e) => ({ id: e.id.toString(), name: e.name }),
      )
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Configurations</h1>
        <p className="mt-1 text-[13px] text-muted">Master data for the cafeteria.</p>
      </div>

      {tabs.length > 0 ? <SettingsTabs tabs={tabs} /> : null}

      <div className="min-w-0">{children}</div>
      <SettingsDrawer emailEntities={emailEntities} />
    </div>
  );
}
