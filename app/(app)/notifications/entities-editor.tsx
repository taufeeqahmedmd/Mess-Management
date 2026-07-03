"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, PANEL, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import { saveEntityAction, saveBranchMappingAction, type NotifyFormState } from "./actions";

/**
 * Email sending entities (Pallavi / DPS) + the branch → entity mapping. Each
 * entity mails from its own domain; a branch's cardholders get mail via the
 * entity mapped here (e.g. PIS Gandipet → Pallavi, DPS branches → DPS). SMTP
 * credentials live in env under SMTP_<PREFIX>_* — the badge shows whether they
 * are present on this server.
 */

export type EntityRow = {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  envPrefix: string;
  active: boolean;
  smtpConfigured: boolean;
};

export type BranchRow = { id: string; name: string; code: string; emailEntityId: string | null };

const initial: NotifyFormState = {};

function EntityCard({ entity }: { entity: EntityRow }) {
  const { state, onSubmit, pending } = useConfirmedAction(saveEntityAction, initial, {
    confirm: {
      title: "Save entity",
      message: `Save the ${entity.name} sending identity?`,
      confirmLabel: "Yes, save",
    },
    successMessage: `${entity.name} saved.`,
  });

  return (
    <form onSubmit={onSubmit} className={`${PANEL} flex flex-col gap-3.5 p-5`}>
      <input type="hidden" name="id" value={entity.id} />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[16px] font-bold text-ink">{entity.name}</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide ${
            entity.smtpConfigured ? "bg-sage-soft text-sage-deep" : "bg-surface-2 text-muted"
          }`}
        >
          <span className={`size-1.5 rounded-full ${entity.smtpConfigured ? "bg-sage" : "bg-line-strong"}`} />
          {entity.smtpConfigured ? "SMTP configured" : "SMTP pending"}
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor={`ent-fromname-${entity.id}`} className={FORM_LABEL}>From name</label>
        <input id={`ent-fromname-${entity.id}`} name="fromName" required maxLength={120} defaultValue={entity.fromName} className={FORM_INPUT} />
      </div>
      <div>
        <label htmlFor={`ent-fromemail-${entity.id}`} className={FORM_LABEL}>From email <span className="font-medium normal-case tracking-normal text-muted-2">(the entity&rsquo;s domain)</span></label>
        <input id={`ent-fromemail-${entity.id}`} name="fromEmail" type="email" required maxLength={150} defaultValue={entity.fromEmail} className={`${FORM_INPUT} font-mono`} />
      </div>
      <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-2">
        SMTP credentials are read from <span className="font-mono">SMTP_{entity.envPrefix}_HOST / _PORT / _USER / _PASS</span> on the server.
      </p>
      <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="active" defaultChecked={entity.active} className="size-[16px] accent-[var(--gold)]" />
        Active
      </label>
      <div>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save entity"}
        </button>
      </div>
    </form>
  );
}

export function EntitiesEditor({ entities, branches }: { entities: EntityRow[]; branches: BranchRow[] }) {
  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(branches.map((b) => [b.id, b.emailEntityId ?? ""])),
  );
  const { state, onSubmit, pending } = useConfirmedAction(saveBranchMappingAction, initial, {
    confirm: {
      title: "Save branch mapping",
      message: "Apply the branch → entity mapping? Mail for each branch's cardholders goes out via its entity domain.",
      confirmLabel: "Yes, save",
    },
    successMessage: "Branch mapping saved.",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {entities.map((e) => <EntityCard key={e.id} entity={e} />)}
      </div>

      <form onSubmit={onSubmit} className={PANEL}>
        <input type="hidden" name="payload" value={JSON.stringify(mapping)} />
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
          <span className="h-[15px] w-1 rounded-full bg-gold" />
          <h3 className="font-display text-[15px] font-bold text-ink">Branch → entity mapping</h3>
        </div>

        {state.error ? (
          <p role="alert" className="mx-5 mt-3 rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-col">
          {branches.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
              <div>
                <span className="text-[13.5px] font-medium text-ink">{b.name}</span>
                <span className="ml-2 font-mono text-[11.5px] text-muted-2">{b.code}</span>
              </div>
              <select
                value={mapping[b.id] ?? ""}
                onChange={(ev) => setMapping((prev) => ({ ...prev, [b.id]: ev.target.value }))}
                aria-label={`${b.name} email entity`}
                className="rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
              >
                <option value="">— Not mapped —</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="border-t border-line px-5 py-3.5">
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>
            {pending ? "Saving…" : "Save mapping"}
          </button>
        </div>
      </form>
    </div>
  );
}
