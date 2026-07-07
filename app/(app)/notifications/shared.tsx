import Link from "next/link";
import { Prisma, type NotificationChannel, type NotificationLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDateTimeInZone } from "@/lib/time";
import { parseRecipients } from "@/services/notifications";
import { NOTIFICATION_EVENTS, notificationEvent } from "@/services/notification-events";
import { resolveDateRange } from "@/services/reporting";
import { PANEL, TH, TD, INPUT_FIND, BTN_PRIMARY, LINK_ACT_GOLD, clampPageSize } from "@/components/ui/controls";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { retryNotificationAction } from "./actions";
import type { RuleRow, EventRowDef } from "./rules-editor";
import type { TemplateRow } from "./template-manager";

/** Recent-notifications filters, read from the channel page's searchParams. */
export type LogParams = {
  status?: string;
  event?: string;
  lq?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
};

const LOG_STATUSES: NotificationLogStatus[] = ["sent", "failed", "skipped", "pending"];

/** Server-side loader shared by the three channel pages. */
export async function loadChannelData(channel: NotificationChannel, lp: LogParams = {}): Promise<{
  events: EventRowDef[];
  roles: string[];
  templates: TemplateRow[];
  initialRules: Record<string, RuleRow>;
  logs: LogRow[];
  logFilters: LogFilters;
}> {
  const lq = (lp.lq ?? "").trim();
  const status = (LOG_STATUSES as string[]).includes(lp.status ?? "") ? (lp.status as NotificationLogStatus) : undefined;
  const event = notificationEvent(lp.event ?? "") ? lp.event : undefined;
  const hasRange = Boolean(lp.from || lp.to);
  const range = resolveDateRange(lp.from, lp.to, new Date());
  const page = Math.max(1, Number.parseInt(lp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(lp.size, 25);

  const logWhere: Prisma.NotificationLogWhereInput = {
    channel,
    ...(status ? { status } : {}),
    ...(event ? { eventCode: event } : {}),
    ...(hasRange ? { createdAt: { gte: range.from, lt: range.toExclusive } } : {}),
    ...(lq
      ? {
          OR: [
            { recipient: { contains: lq, mode: "insensitive" } },
            { body: { contains: lq, mode: "insensitive" } },
            { error: { contains: lq, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rules, templates, roles, logs, logTotal] = await Promise.all([
    prisma.notificationRule.findMany({ where: { channel } }),
    prisma.notificationTemplate.findMany({ where: { channel }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { id: "asc" }, select: { name: true } }),
    prisma.notificationLog.findMany({
      where: logWhere,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationLog.count({ where: logWhere }),
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
    logFilters: {
      lq,
      status: status ?? "",
      event: event ?? "",
      from: hasRange ? (lp.from ?? "") : "",
      to: hasRange ? (lp.to ?? "") : "",
      page,
      pageSize,
      total: logTotal,
      filtered: Boolean(lq || status || event || hasRange),
    },
  };
}

export type LogFilters = {
  lq: string;
  status: string;
  event: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  filtered: boolean;
};

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

const LOG_SEL =
  "rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/** Recent outbox rows for one channel (server-rendered), with filters + pager. */
export function LogTable({ logs, base, filters }: { logs: LogRow[]; base: string; filters: LogFilters }) {
  return (
    <div className={PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[15px] w-1 rounded-full bg-line-strong" />
          <h3 className="font-display text-[15px] font-bold text-ink">Recent notifications</h3>
          <span className="text-[11.5px] text-muted-2">{filters.total.toLocaleString("en-IN")} total{filters.filtered ? " · filtered" : ""}</span>
        </div>
      </div>

      {/* Filters: plain GET form — the channel page re-reads them from searchParams. */}
      <form method="get" action={base} className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3">
        <input type="hidden" name="tab" value="log" />
        <input
          name="lq"
          defaultValue={filters.lq}
          placeholder="Search recipient, message, error…"
          aria-label="Search notifications"
          className={`${INPUT_FIND} min-w-[200px] flex-1 sm:max-w-[300px]`}
        />
        <select name="status" defaultValue={filters.status} aria-label="Status" className={LOG_SEL}>
          <option value="">Any status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="pending">Pending</option>
        </select>
        <select name="event" defaultValue={filters.event} aria-label="Event" className={LOG_SEL}>
          <option value="">All events</option>
          {NOTIFICATION_EVENTS.map((e) => (
            <option key={e.code} value={e.code}>{e.label}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={filters.from} aria-label="From date" className={LOG_SEL} />
        <input type="date" name="to" defaultValue={filters.to} aria-label="To date" className={LOG_SEL} />
        <button type="submit" className={BTN_PRIMARY}>Search</button>
        {filters.filtered ? (
          <Link href={`${base}?tab=log`} className="px-2 text-[13px] font-medium text-muted transition-colors hover:text-ink-2">
            Clear
          </Link>
        ) : null}
      </form>

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
              <tr><td colSpan={6} className="px-5 py-8 text-center text-[13px] text-muted">{filters.filtered ? "No notifications match your filters." : "Nothing sent yet."}</td></tr>
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
      <Pager page={filters.page} pageSize={filters.pageSize} total={filters.total} />
    </div>
  );
}
