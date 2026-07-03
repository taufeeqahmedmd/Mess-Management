import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { whatsappConfigured } from "@/lib/notifications/senders";
import { RulesEditor } from "../rules-editor";
import { TemplateManager } from "../template-manager";
import { loadChannelData, LogTable, ChannelTabs, activeTab } from "../shared";
import { NOTIFICATION_EVENTS } from "@/services/notification-events";

const TABS = [
  { key: "rules", label: "Event rules" },
  { key: "templates", label: "Templates" },
  { key: "log", label: "Recent notifications" },
] as const;

/**
 * Notifications Management → WhatsApp Communication (Super Admin). Templates map
 * approved Smartping Business template ids + ordered variables to application
 * events — editable from the portal without code changes.
 */
export default async function WhatsAppNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "notifications.manage")) redirect(landingFor(actor));

  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab);
  const data = await loadChannelData("whatsapp");
  const configured = whatsappConfigured();
  const allVariables = [...new Set(NOTIFICATION_EVENTS.flatMap((e) => e.variables))];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">WhatsApp Communication</h1>
          <p className="mt-1 text-[13px] text-muted">
            Event messages to cardholders via WhatsApp Business (Smartping) using approved templates.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ${
            configured ? "bg-sage-soft text-sage-deep" : "bg-surface-2 text-muted"
          }`}
        >
          <span className={`size-1.5 rounded-full ${configured ? "bg-sage" : "bg-line-strong"}`} />
          {configured ? "Smartping configured" : "Smartping pending (API key)"}
        </span>
      </div>

      <ChannelTabs base="/notifications/whatsapp" tabs={TABS} active={tab} />

      {tab === "templates" ? (
        <TemplateManager channel="whatsapp" templates={data.templates} variablesHint={allVariables} />
      ) : tab === "rules" ? (
        <RulesEditor
          channel="whatsapp"
          events={data.events}
          roles={data.roles}
          templates={data.templates.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
          initialRules={data.initialRules}
        />
      ) : (
        <LogTable logs={data.logs} />
      )}
    </div>
  );
}
