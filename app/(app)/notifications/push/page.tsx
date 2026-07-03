import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { pushConfigured } from "@/lib/notifications/senders";
import { RulesEditor } from "../rules-editor";
import { TemplateManager } from "../template-manager";
import { loadChannelData, LogTable, ChannelTabs, activeTab } from "../shared";
import { NOTIFICATION_EVENTS } from "@/services/notification-events";

const TABS = [
  { key: "rules", label: "Event rules" },
  { key: "templates", label: "Templates" },
  { key: "log", label: "Recent notifications" },
] as const;

/** Notifications Management → Push Notifications (Super Admin). */
export default async function PushNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "notifications.manage")) redirect(landingFor(actor));

  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab);
  const data = await loadChannelData("push");
  const configured = pushConfigured();
  const allVariables = [...new Set(NOTIFICATION_EVENTS.flatMap((e) => e.variables))];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Push Notifications</h1>
          <p className="mt-1 text-[13px] text-muted">
            Per-event push to staff &amp; vendor logins on this app. Enable an event, pick who gets it, and choose a template.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ${
            configured ? "bg-sage-soft text-sage-deep" : "bg-surface-2 text-muted"
          }`}
        >
          <span className={`size-1.5 rounded-full ${configured ? "bg-sage" : "bg-line-strong"}`} />
          {configured ? "Web Push configured" : "Web Push pending (VAPID keys)"}
        </span>
      </div>

      <ChannelTabs base="/notifications/push" tabs={TABS} active={tab} />

      {tab === "rules" ? (
        <RulesEditor
          channel="push"
          events={data.events}
          roles={data.roles}
          templates={data.templates.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
          initialRules={data.initialRules}
        />
      ) : tab === "templates" ? (
        <TemplateManager channel="push" templates={data.templates} variablesHint={allVariables} />
      ) : (
        <LogTable logs={data.logs} />
      )}
    </div>
  );
}
