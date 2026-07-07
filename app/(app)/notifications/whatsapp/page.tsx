import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { whatsappConfigured, partnerConfigured } from "@/lib/notifications/smartping";
import { RulesEditor } from "../rules-editor";
import { TemplateManager } from "../template-manager";
import { WaSyncPanel, WaEventReference } from "../whatsapp-templates";
import { loadChannelData, LogTable, ChannelTabs, activeTab } from "../shared";
import { NOTIFICATION_EVENTS } from "@/services/notification-events";

const TABS = [
  { key: "rules", label: "Event rules" },
  { key: "templates", label: "Templates" },
  { key: "log", label: "Recent notifications" },
] as const;

/**
 * Notifications Management → WhatsApp Communication (Super Admin). Templates are
 * created & approved in Smartping; the app FETCHES them via the Partner API
 * (read-only Templates tab + "Sync from Smartping") and the admin only maps one
 * per event in Event rules. At send time the approved template's {{1}},{{2}},…
 * are filled from the event (waParams).
 */
export default async function WhatsAppNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; event?: string; lq?: string; from?: string; to?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "notifications.manage")) redirect(landingFor(actor));

  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab);
  const data = await loadChannelData("whatsapp", sp);
  const partnerReady = partnerConfigured();
  const configured = partnerReady || whatsappConfigured();

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
          {partnerReady ? "Smartping connected" : configured ? "Send-only (add Partner API to sync)" : "Smartping pending (API keys)"}
        </span>
      </div>

      <ChannelTabs base="/notifications/whatsapp" tabs={TABS} active={tab} />

      {tab === "rules" ? (
        <RulesEditor
          channel="whatsapp"
          events={data.events}
          roles={data.roles}
          templates={data.templates.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
          initialRules={data.initialRules}
        />
      ) : tab === "templates" ? (
        <div className="flex flex-col gap-4">
          <WaSyncPanel partnerReady={partnerReady} />
          <TemplateManager channel="whatsapp" templates={data.templates} variablesHint={[]} />
          <WaEventReference eventRefs={NOTIFICATION_EVENTS.map((e) => ({ label: e.label, params: e.waParams }))} />
        </div>
      ) : (
        <LogTable logs={data.logs} base="/notifications/whatsapp" filters={data.logFilters} />
      )}
    </div>
  );
}
