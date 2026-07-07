import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { smtpConfigured } from "@/lib/notifications/senders";
import { RulesEditor } from "../rules-editor";
import { TemplateManager } from "../template-manager";
import { EntitiesEditor } from "../entities-editor";
import { loadChannelData, LogTable, ChannelTabs, activeTab } from "../shared";
import { NOTIFICATION_EVENTS } from "@/services/notification-events";

const TABS = [
  { key: "rules", label: "Event rules" },
  { key: "templates", label: "Templates" },
  { key: "entities", label: "Entities & branches" },
  { key: "log", label: "Recent notifications" },
] as const;

/**
 * Notifications Management → Email Notifications (Super Admin). Two sending
 * entities (Pallavi / DPS) — each branch's cardholders are mailed via their
 * entity's domain (PIS Gandipet → Pallavi; the DPS branches → DPS).
 */
export default async function EmailNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; event?: string; lq?: string; from?: string; to?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "notifications.manage")) redirect(landingFor(actor));

  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab);
  const [data, entities, branches] = await Promise.all([
    loadChannelData("email", sp),
    prisma.emailEntity.findMany({ orderBy: { id: "asc" } }),
    prisma.branch.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, emailEntityId: true } }),
  ]);
  const allVariables = [...new Set(NOTIFICATION_EVENTS.flatMap((e) => e.variables))];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Email Notifications</h1>
        <p className="mt-1 text-[13px] text-muted">
          Event emails to cardholders (and staff) — sent from the branch&rsquo;s entity domain.
        </p>
      </div>

      <ChannelTabs base="/notifications/email" tabs={TABS} active={tab} />

      {tab === "entities" ? (
        <EntitiesEditor
          entities={entities.map((e) => ({
            id: e.id.toString(),
            name: e.name,
            fromName: e.fromName,
            fromEmail: e.fromEmail,
            envPrefix: e.envPrefix,
            active: e.active,
            smtpConfigured: smtpConfigured(e.envPrefix),
          }))}
          branches={branches.map((b) => ({
            id: b.id.toString(),
            name: b.name,
            code: b.code,
            emailEntityId: b.emailEntityId ? b.emailEntityId.toString() : null,
          }))}
        />
      ) : tab === "rules" ? (
        <RulesEditor
          channel="email"
          events={data.events}
          roles={data.roles}
          templates={data.templates.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
          initialRules={data.initialRules}
        />
      ) : tab === "templates" ? (
        <TemplateManager channel="email" templates={data.templates} variablesHint={allVariables} />
      ) : (
        <LogTable logs={data.logs} base="/notifications/email" filters={data.logFilters} />
      )}
    </div>
  );
}
