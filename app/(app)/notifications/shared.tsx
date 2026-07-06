import Link from "next/link";
import type { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInZone } from "@/lib/time";
import { parseRecipients } from "@/services/notifications";
import { NOTIFICATION_EVENTS } from "@/services/notification-events";
import { PANEL, TH, TD, LINK_ACT_GOLD } from "@/components/ui/controls";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { retryNotificationAction } from "./actions";
import type { RuleRow, EventRowDef } from "./rules-editor";
import type { TemplateRow } from "./template-manager";

/** Server-side loader shared by the three channel pages. */
export async function loadChannelData(channel: NotificationChannel): Promise<{
  events: EventRowDef[];
  roles: string[];
  templates: TemplateRow[];
  initialRules: Record<string, RuleRow>;
  logs: LogRow[];
}> {
  const [rules, templates, roles, logs] = await Promise.all([
    prisma.notificationRule.findMany({ where: { channel } }),
    prisma.notificationTemplate.findMany({ where: { channel }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { id: "asc" }, select: { name: true } }),
    prisma.notificationLog.findMany({ where: { channel }, orderBy: { id: "desc" }, take: 15 }),
  ]);

  const initialRules: Record<string, RuleRow> = {};
  for (const r of rules) {
    initialRules[r.eventCode] = {
      enabled: r.enabled,
      recipients: parseRecipients(r.recipients),
      frequency: r.frequency,
      templateId: r.templateId ? r.templateId.toString() : null,
    };
  }

  return {
    events: NOTIFICATION_EVENTS.map((e) => ({ ...e, variables: [...e.variables] })),
    roles: roles.map((r) => r.name),
    templates: templates.map((t) => ({
      id: t.id.toString(),
      name: t.name,
      title: t.title,
      body: t.body,
      waTemplateId: t.waTemplateId,
      waLanguage: t.waLanguage,
      waVariables: Array.isArray(t.waVariables) ? t.waVariables.map(String) : [],
      active: t.active,
    })),
    initialRules,
    logs: logs.map((l) => ({
      id: l.id.toString(),
      eventCode: l.eventCode,
      recipient: l.recipient,
      body: l.body,
      status: l.status,
      error: l.error,
      at: formatDateTimeInZone(l.createdAt),
    })),
  };
}

export type LogRow = {
  id: string;
  eventCode: string;
  recipient: string;
  body: string;
  status: string;
  error: string | null;
  at: string;
};

export type ChannelTab = { key: string; label: string };

/** Pill tab bar for the notification pages (same pattern as Reports). */
export function ChannelTabs({ base, tabs, active }: { base: string; tabs: readonly ChannelTab[]; active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-px">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-pill px-4 py-2 text-[13px] font-medium transition-colors ${
              isActive ? "bg-gold-soft-2 font-semibold text-gold-deep" : "text-muted hover:bg-gold-soft hover:text-gold-deep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Resolve the active tab from ?tab=, falling back to the first tab. */
export function activeTab(tabs: readonly ChannelTab[], raw: string | undefined): string {
  return tabs.find((t) => t.key === raw)?.key ?? tabs[0].key;
}

const LOG_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  sent: { label: "Sent", dot: "bg-sage", text: "text-sage-deep" },
  pending: { label: "Pending", dot: "bg-gold", text: "text-gold-deep" },
  failed: { label: "Failed", dot: "bg-tomato", text: "text-tomato" },
  skipped: { label: "Skipped", dot: "bg-line-strong", text: "text-muted" },
};

/** Recent outbox rows for one channel (server-rendered). */
export function LogTable({ logs }: { logs: LogRow[] }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
        <span className="h-[15px] w-1 rounded-full bg-line-strong" />
        <h3 className="font-display text-[15px] font-bold text-ink">Recent notifications</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th className={TH}>When</th>
              <th className={TH}>Event</th>
              <th className={TH}>Recipient</th>
              <th className={TH}>Message</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-[13px] text-muted">Nothing sent yet.</td></tr>
            ) : (
              logs.map((l) => {
                const st = LOG_STATUS[l.status] ?? LOG_STATUS.pending;
                return (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px] text-muted`}>{l.at}</td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px] text-ink-2`}>{l.eventCode}</td>
                    <td className={`${TD} whitespace-nowrap font-mono text-[12px] text-ink-2`}>{l.recipient}</td>
                    <td className={`${TD} max-w-[320px] truncate text-[12.5px] text-muted`} title={l.error ?? l.body}>{l.body}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${st.text}`} title={l.error ?? undefined}>
                        <span className={`size-[7px] rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      {l.status === "sent" ? (
                        <span className="text-[12px] text-muted-2">—</span>
                      ) : (
                        <ConfirmActionForm
                          action={retryNotificationAction}
                          fields={{ id: l.id }}
                          confirm={{
                            title: "Retry notification",
                            message: `Resend this ${l.eventCode} notification to ${l.recipient}?`,
                            confirmLabel: "Yes, retry",
                          }}
                          successMessage="Retried — the row's status has been updated."
                          buttonClassName={LINK_ACT_GOLD}
                        >
                          Retry
                        </ConfirmActionForm>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
