"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { issueCardAction, replaceCardAction, type CardState } from "./card-actions";

const initial: CardState = {};

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

function Feedback({ state }: { state: CardState }) {
  if (state.error) {
    return <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>;
  }
  if (state.success) {
    return <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Done.</p>;
  }
  return null;
}

export function IssueCardForm({ userId }: { userId: string }) {
  const { state, onSubmit, pending } = useConfirmedAction(issueCardAction, initial, {
    confirm: {
      title: "Issue card",
      message: "Issue this card to the cardholder?",
      confirmLabel: "Yes, issue",
    },
    successMessage: "Card issued.",
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Feedback state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cardUid" className="text-xs font-semibold text-ink-2">Card UID</label>
          <input id="cardUid" name="cardUid" required maxLength={64} placeholder="Tap a card" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="issue-exp" className="text-xs font-semibold text-ink-2">Expiry (optional)</label>
          <input id="issue-exp" name="expiresOn" type="date" className={inputClass} />
        </div>
      </div>
      <div>
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Issuing…" : "Issue card"}
        </button>
      </div>
    </form>
  );
}

export function ReplaceCardForm({ userId }: { userId: string }) {
  const { state, onSubmit, pending } = useConfirmedAction(replaceCardAction, initial, {
    confirm: {
      title: "Replace card",
      message: "Replace the active card with this new one?",
      confirmLabel: "Yes, replace",
      tone: "danger",
    },
    successMessage: "Card replaced.",
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <Feedback state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newUid" className="text-xs font-semibold text-ink-2">New card UID</label>
          <input id="newUid" name="newUid" required maxLength={64} placeholder="Tap the new card" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="replace-exp" className="text-xs font-semibold text-ink-2">Expiry (optional)</label>
          <input id="replace-exp" name="expiresOn" type="date" className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reason" className="text-xs font-semibold text-ink-2">Reason</label>
        <input id="reason" name="reason" maxLength={255} placeholder="Lost card, damaged, …" className={inputClass} />
      </div>
      <div>
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Replacing…" : "Replace card"}
        </button>
      </div>
    </form>
  );
}
