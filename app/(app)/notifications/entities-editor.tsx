"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, PANEL, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import { saveEntityAction, type NotifyFormState } from "./actions";

/**
 * Email sending entities (Pallavi / DPS): edit each entity's From identity here.
 * Each entity mails from its own domain; a branch's cardholders get mail via
 * the entity mapped to their branch. The mapping itself is edited on the branch
 * (Settings → Branches → Edit) and shown read-only below. SMTP credentials live
 * in env under SMTP_<PREFIX>_* — the badge shows whether they are present.
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
  const entityName = new Map(entities.map((e) => [e.id, e.name]));

  return (
    <div className="flex flex-col gap-4">
      {entities.length === 0 ? (
        <p className={`${PANEL} px-5 py-4 text-[13px] text-ink-2`}>
          No sending entities exist yet. Run <span className="font-mono text-[12px]">npm run db:sync-entities</span> on
          the server to create the Pallavi / DPS entities and map existing branches.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {entities.map((e) => <EntityCard key={e.id} entity={e} />)}
      </div>

      <div className={PANEL}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-[15px] w-1 rounded-full bg-gold" />
            <h3 className="font-display text-[15px] font-bold text-ink">Branch → entity mapping</h3>
          </div>
          <span className="text-[11.5px] text-muted-2">
            Set per branch in{" "}
            <Link href="/settings/branches" className="font-semibold text-gold-deep hover:underline">
              Settings → Branches
            </Link>
          </span>
        </div>

        <div className="flex flex-col">
          {branches.map((b) => {
            const mapped = b.emailEntityId ? entityName.get(b.emailEntityId) : null;
            return (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                <div>
                  <span className="text-[13.5px] font-medium text-ink">{b.name}</span>
                  <span className="ml-2 font-mono text-[11.5px] text-muted-2">{b.code}</span>
                </div>
                {mapped ? (
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-sage-soft px-2.5 py-1 text-[12px] font-semibold text-sage-deep">
                    <span className="size-1.5 rounded-full bg-sage" />
                    {mapped}
                  </span>
                ) : (
                  <Link
                    href={`/settings/branches/${b.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:text-gold-deep"
                  >
                    <span className="size-1.5 rounded-full bg-line-strong" />
                    Not mapped — set up
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
