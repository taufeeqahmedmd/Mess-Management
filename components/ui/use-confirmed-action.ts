"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useConfirm, type ConfirmOptions } from "./confirm";
import { useToast } from "./toast";

type WithFeedback = { error?: string; success?: boolean };

type Options = {
  /** Dialog content shown before the change is committed. */
  confirm?: ConfirmOptions;
  /** Toast shown when the action returns `success` (non-redirecting actions). */
  successMessage?: string;
};

/**
 * Wraps a `useActionState` server action so that every submission is gated by a
 * confirm dialog and its result surfaces as a toast. Drop-in for the existing
 * forms: replace `action={formAction}` with `onSubmit={onSubmit}`.
 *
 * Redirecting actions (create/edit) never return `success` here — their toast
 * is raised by <FlashToast> on the destination page. Non-redirecting actions
 * (matrices, password, cards) raise it via `successMessage`.
 */
export function useConfirmedAction<S extends WithFeedback>(
  action: (prev: S, formData: FormData) => S | Promise<S>,
  initialState: S,
  options?: Options,
) {
  // The generic S fights useActionState's `Awaited<S>` parameter typing; the
  // cast keeps the public hook signature clean while staying sound at runtime.
  const [state, dispatch, actionPending] = useActionState(
    action as unknown as (state: Awaited<S>, payload: FormData) => S | Promise<S>,
    initialState as Awaited<S>,
  ) as unknown as [S, (payload: FormData) => void, boolean];
  const confirm = useConfirm();
  const toast = useToast();
  const [transitionPending, startTransition] = useTransition();
  const lastState = useRef<S>(initialState);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.error) {
      toast.error(state.error);
    } else if (state.success && options?.successMessage) {
      toast.success(options.successMessage);
    }
  }, [state, toast, options?.successMessage]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const ok = await confirm(options?.confirm);
    if (!ok) return;
    const formData = new FormData(form);
    startTransition(() => dispatch(formData));
  }

  return { state, onSubmit, pending: actionPending || transitionPending };
}
