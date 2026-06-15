"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Promise-based confirmation dialog (Warm Cafeteria). Mount <ConfirmProvider>
 * once near the root; call const confirm = useConfirm() and `await confirm({...})`
 * from any client component. Resolves true on confirm, false on cancel/Escape/
 * backdrop — the caller applies the change only on true ("else no changes").
 *
 * Accessibility: role="alertdialog", aria-modal, labelled/described by its
 * title/body, Escape to cancel, focus moves into the dialog and the primary
 * action is focused on open.
 */

export type ConfirmTone = "default" | "danger";

export type ConfirmOptions = {
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((opts?: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? <ConfirmDialog options={pending} onSettle={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts?: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a <ConfirmProvider>.");
  }
  return ctx;
}

function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const {
    title = "Confirm change",
    message = "Apply this change?",
    confirmLabel = "Yes, apply",
    cancelLabel = "Cancel",
    tone = "default",
  } = options;

  const confirmBtn = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the primary action on open, trap Tab within the dialog, and restore
  // focus to the triggering element when the dialog closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmBtn.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onSettle(false);
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onSettle]);

  const danger = tone === "danger";
  // Danger uses a deep red (tomato darkened with ink) so white text passes AA;
  // plain --tomato + white is only ~3.3:1.
  const confirmClass = danger
    ? "text-white shadow-md transition hover:brightness-110"
    : "bg-gold-deep text-white shadow-gold transition hover:brightness-110";

  return (
    <div
      className="animate-overlay-fade fixed inset-0 z-[150] flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="animate-dialog-pop w-full max-w-sm rounded-md border border-line bg-surface p-5 shadow-lg"
      >
        <h2
          id="confirm-title"
          className="font-display text-lg font-semibold text-ink"
        >
          {title}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm text-ink-2">
          {message}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtn}
            type="button"
            onClick={() => onSettle(true)}
            style={danger ? { backgroundColor: "color-mix(in srgb, var(--tomato) 78%, var(--ink))" } : undefined}
            className={`rounded-sm px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
