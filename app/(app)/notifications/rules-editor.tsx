"use client";

import { useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, PANEL } from "@/components/ui/controls";
import { saveRulesAction, type NotifyFormState } from "./actions";

/**
 * Per-channel event configuration grid (Notifications Management). One row per
 * catalog event: enable/disable, recipients (audience-aware), frequency, and
 * template. Rows are grouped by module. State is client-side; Save submits the
 * whole channel as one JSON payload (upserted per event on the server).
 */

export type RuleRow = {
  enabled: boolean;
  recipients: { roles: string[]; vendor: boolean; requester: boolean; cardholder: boolean };
  frequency: "instant" | "daily_digest";
  templateId: string | null;
};

export type EventRowDef = {
  code: string;
  module: string;
  label: string;
  description: string;
  variables: readonly string[];
  audience: { cardholder: boolean; vendor: boolean; requester: boolean; roles: boolean };
};

const initial: NotifyFormState = {};

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full align-middle transition-colors focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30 ${on ? "bg-sage" : "bg-line-strong"}`}
    >
      <span className={`inline-block size-[16px] rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[19px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

export function RulesEditor({
  channel,
  events,
  roles,
  templates,
  initialRules,
}: {
  channel: "push" | "email" | "whatsapp";
  events: EventRowDef[];
  roles: string[];
  templates: { id: string; name: string }[];
  initialRules: Record<string, RuleRow>;
}) {
  const [rules, setRules] = useState<Record<string, RuleRow>>(() => {
    const out: Record<string, RuleRow> = {};
    for (const e of events) {
      out[e.code] = initialRules[e.code] ?? {
        enabled: false,
        recipients: { roles: [], vendor: false, requester: false, cardholder: false },
        frequency: "instant",
        templateId: null,
      };
    }
    return out;
  });

  const { state, onSubmit, pending } = useConfirmedAction(saveRulesAction, initial, {
    confirm: {
      title: "Save notification rules",
      message: `Apply the ${channel === "whatsapp" ? "WhatsApp" : channel} rules for all events?`,
      confirmLabel: "Yes, save",
    },
    successMessage: "Notification rules saved.",
  });

  const set = (code: string, patch: Partial<RuleRow>) =>
    setRules((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  const setRecipients = (code: string, patch: Partial<RuleRow["recipients"]>) =>
    setRules((prev) => ({ ...prev, [code]: { ...prev[code], recipients: { ...prev[code].recipients, ...patch } } }));

  const payload = JSON.stringify(
    events.map((e) => ({
      eventCode: e.code,
      enabled: rules[e.code].enabled,
      recipients: rules[e.code].recipients,
      frequency: rules[e.code].frequency,
      templateId: rules[e.code].templateId,
    })),
  );

  const modules = [...new Set(events.map((e) => e.module))];
  const roleOptions = roles.map((r) => ({ value: r, label: r }));

  const CHECK = "size-[15px] accent-[var(--gold)]";
  const SEL =
    "rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="payload" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      {modules.map((mod) => (
        <div key={mod} className={PANEL}>
          <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
            <span className="h-[15px] w-1 rounded-full bg-gold" />
            <h3 className="font-display text-[15px] font-bold text-ink">{mod}</h3>
          </div>
          <div className="flex flex-col">
            {events
              .filter((e) => e.module === mod)
              .map((e) => {
                const r = rules[e.code];
                return (
                  <div key={e.code} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 lg:grid lg:grid-cols-[minmax(220px,1.4fr)_2fr_150px_190px] lg:items-start lg:gap-5">
                    <div className="flex items-start gap-3">
                      <Toggle on={r.enabled} onToggle={() => set(e.code, { enabled: !r.enabled })} label={`${e.label} enabled`} />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink">{e.label}</div>
                        <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-2">{e.description}</div>
                        <div className="mt-1 font-mono text-[10.5px] text-muted-2">
                          {e.variables.map((v) => `{{${v}}}`).join(" ")}
                        </div>
                      </div>
                    </div>

                    <div className={r.enabled ? "" : "pointer-events-none opacity-45"}>
                      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Recipients</span>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-2">
                        {e.audience.cardholder ? (
                          <label className="inline-flex items-center gap-1.5">
                            <input type="checkbox" className={CHECK} checked={r.recipients.cardholder} onChange={(ev) => setRecipients(e.code, { cardholder: ev.target.checked })} />
                            Cardholder
                          </label>
                        ) : null}
                        {e.audience.vendor ? (
                          <label className="inline-flex items-center gap-1.5">
                            <input type="checkbox" className={CHECK} checked={r.recipients.vendor} onChange={(ev) => setRecipients(e.code, { vendor: ev.target.checked })} />
                            Vendor staff
                          </label>
                        ) : null}
                        {e.audience.requester ? (
                          <label className="inline-flex items-center gap-1.5">
                            <input type="checkbox" className={CHECK} checked={r.recipients.requester} onChange={(ev) => setRecipients(e.code, { requester: ev.target.checked })} />
                            Requester
                          </label>
                        ) : null}
                      </div>
                      {e.audience.roles ? (
                        <div className="mt-2 max-w-[320px]">
                          <MultiSelect
                            options={roleOptions}
                            selected={r.recipients.roles}
                            onChange={(next) => setRecipients(e.code, { roles: next })}
                            ariaLabel={`${e.label} recipient roles`}
                            placeholder="Staff roles (optional)…"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className={r.enabled ? "" : "pointer-events-none opacity-45"}>
                      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Frequency</span>
                      <select
                        value={r.frequency}
                        onChange={(ev) => set(e.code, { frequency: ev.target.value as RuleRow["frequency"] })}
                        aria-label={`${e.label} frequency`}
                        className={`${SEL} w-full`}
                      >
                        <option value="instant">Instant</option>
                        <option value="daily_digest">Daily digest</option>
                      </select>
                    </div>

                    <div className={r.enabled ? "" : "pointer-events-none opacity-45"}>
                      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Template</span>
                      <select
                        value={r.templateId ?? ""}
                        onChange={(ev) => set(e.code, { templateId: ev.target.value || null })}
                        aria-label={`${e.label} template`}
                        className={`${SEL} w-full`}
                      >
                        <option value="">Default (auto summary)</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}

      <div>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save rules"}
        </button>
      </div>
    </form>
  );
}
