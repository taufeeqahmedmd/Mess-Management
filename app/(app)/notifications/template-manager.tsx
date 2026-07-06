"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, BTN_GHOST, PANEL, FORM_LABEL, FORM_INPUT, LINK_ACT_GOLD, LINK_ACT_DANGER } from "@/components/ui/controls";
import { saveTemplateAction, deleteTemplateAction, type NotifyFormState } from "./actions";

/**
 * Channel template CRUD. Email/push templates use {{variable}} placeholders from
 * the event catalog. WhatsApp rows only REGISTER a Smartping template for the
 * event-rule dropdown: the exact template name (Partner/Direct send) or Live
 * API-Campaign name (campaign-API send), an optional language + message preview.
 * Rows can also arrive via "Sync from Smartping"; the send fills the approved
 * template's positional params from the event's waParams.
 */

export type TemplateRow = {
  id: string;
  name: string;
  title: string | null;
  body: string;
  waTemplateId: string | null;
  waLanguage: string | null;
  waVariables: string[];
  active: boolean;
};

const initial: NotifyFormState = {};

export function TemplateManager({
  channel,
  templates,
  variablesHint,
}: {
  channel: "push" | "email" | "whatsapp";
  templates: TemplateRow[];
  variablesHint: string[];
}) {
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [creating, setCreating] = useState(false);
  const isWa = channel === "whatsapp";
  const titleLabel = channel === "email" ? "Subject" : "Title";

  const { state, onSubmit, pending } = useConfirmedAction(saveTemplateAction, initial, {
    confirm: {
      title: editing ? "Save template" : "Create template",
      message: editing ? "Save changes to this template?" : "Create this template?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Template saved.",
  });

  const open = creating || editing !== null;
  const t = editing;

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-[15px] w-1 rounded-full bg-sage" />
          <h3 className="font-display text-[15px] font-bold text-ink">Templates</h3>
        </div>
        {!open ? (
          <button type="button" onClick={() => { setCreating(true); setEditing(null); }} className={BTN_GHOST}>
            New template
          </button>
        ) : null}
      </div>

      {templates.length === 0 && !open ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">
          No templates yet — events fall back to an auto summary. Create one to control the wording.
        </p>
      ) : null}

      {templates.length > 0 ? (
        <ul className="flex flex-col">
          {templates.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{row.name}</span>
                  {!row.active ? <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Disabled</span> : null}
                  {isWa && row.waTemplateId ? (
                    <span className="font-mono text-[11px] text-muted-2">{row.waTemplateId}</span>
                  ) : null}
                  {isWa && row.waLanguage ? (
                    <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">{row.waLanguage}</span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-muted-2">
                  {row.title ? `${row.title} — ` : ""}{row.body}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => { setEditing(row); setCreating(false); }} className={LINK_ACT_GOLD}>
                  Edit
                </button>
                <ConfirmActionForm
                  action={deleteTemplateAction}
                  fields={{ id: row.id }}
                  confirm={{
                    title: "Delete template",
                    message: `Delete "${row.name}"? Rules using it fall back to the auto summary.`,
                    confirmLabel: "Yes, delete",
                    tone: "danger",
                  }}
                  successMessage="Template deleted."
                  buttonClassName={LINK_ACT_DANGER}
                >
                  Delete
                </ConfirmActionForm>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-line bg-surface-2/50 px-5 py-4" key={t?.id ?? "new"}>
          <input type="hidden" name="channel" value={channel} />
          {t ? <input type="hidden" name="id" value={t.id} /> : null}

          {state.error ? (
            <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
              {state.error}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`tpl-name-${channel}`} className={FORM_LABEL}>Name</label>
              <input id={`tpl-name-${channel}`} name="name" required maxLength={120} defaultValue={t?.name} placeholder="e.g. Coupon used" className={FORM_INPUT} />
            </div>
            {isWa ? (
              <div>
                <label htmlFor={`tpl-waid-${channel}`} className={FORM_LABEL}>Smartping template / campaign name</label>
                <input id={`tpl-waid-${channel}`} name="waTemplateId" required maxLength={120} defaultValue={t?.waTemplateId ?? ""} placeholder="e.g. coupon_used_v1" className={`${FORM_INPUT} font-mono`} />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
                  Copy it exactly from Smartping. Campaign-API sends need the <b>Live API Campaign</b> name; Partner-API sends use the template name.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor={`tpl-title-${channel}`} className={FORM_LABEL}>{titleLabel}</label>
                <input id={`tpl-title-${channel}`} name="title" required maxLength={200} defaultValue={t?.title ?? ""} placeholder={channel === "email" ? "e.g. Your meal coupon was used" : "e.g. Coupon used"} className={FORM_INPUT} />
              </div>
            )}
          </div>

          {isWa ? (
            <div className="max-w-[200px]">
              <label htmlFor={`tpl-walang-${channel}`} className={FORM_LABEL}>Language <span className="font-medium normal-case tracking-normal text-muted-2">(optional)</span></label>
              <input id={`tpl-walang-${channel}`} name="waLanguage" maxLength={10} defaultValue={t?.waLanguage ?? "en"} placeholder="en" className={`${FORM_INPUT} font-mono`} />
            </div>
          ) : null}

          <div>
            <label htmlFor={`tpl-body-${channel}`} className={FORM_LABEL}>
              {isWa ? (
                <>Message preview <span className="font-medium normal-case tracking-normal text-muted-2">(optional) — the approved template text, for reference (not sent from here)</span></>
              ) : (
                <>Body <span className="font-medium normal-case tracking-normal text-muted-2">— placeholders: {variablesHint.map((v) => `{{${v}}}`).join(" ")}</span></>
              )}
            </label>
            <textarea id={`tpl-body-${channel}`} name="body" required={!isWa} rows={3} defaultValue={t?.body} placeholder={isWa ? "Hi {{1}}, your {{2}} coupon was used. {{3}} left." : "Hi {{name}}, …"} className={`${FORM_INPUT} resize-y`} />
          </div>

          <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="size-[16px] accent-[var(--gold)]" />
            Active
          </label>

          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={pending} className={BTN_PRIMARY}>
              {pending ? "Saving…" : t ? "Save template" : "Create template"}
            </button>
            <button type="button" onClick={() => { setEditing(null); setCreating(false); }} className={BTN_GHOST}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
