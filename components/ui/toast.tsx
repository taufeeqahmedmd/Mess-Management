"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Lightweight, theme-matched toast system (Warm Cafeteria). No external deps —
 * the stack is locked. Mount <ToastProvider> once near the root; call useToast()
 * from any client component to surface success / error / info feedback.
 *
 * Accessibility: each toast is its own live region — errors assertive
 * (role="alert"), success/info polite (role="status") — so they announce
 * without a wrapping aria-live (which would double-announce). State is never
 * signalled by colour alone — every toast carries a labelled status dot/icon.
 */

export type ToastVariant = "success" | "error" | "info";

type Toast = { id: number; message: string; variant: ToastVariant };

type ToastOptions = { duration?: number };

type ToastApi = {
  show: (message: string, variant?: ToastVariant, opts?: ToastOptions) => number;
  success: (message: string, opts?: ToastOptions) => number;
  error: (message: string, opts?: ToastOptions) => number;
  info: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info", opts?: ToastOptions) => {
      const id = (idRef.current += 1);
      setToasts((list) => [...list, { id, message, variant }]);
      const duration =
        opts?.duration ?? (variant === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, opts) => show(message, "success", opts),
      error: (message, opts) => show(message, "error", opts),
      info: (message, opts) => show(message, "info", opts),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>.");
  }
  return ctx;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { wrap: string; dot: string; label: string; icon: string }
> = {
  success: {
    wrap: "bg-sage-soft text-sage-deep",
    dot: "bg-sage-deep",
    label: "Success",
    icon: "✓",
  },
  error: {
    wrap: "bg-tomato-soft text-tomato",
    dot: "bg-tomato",
    label: "Error",
    icon: "!",
  },
  info: {
    wrap: "bg-gold-soft text-ink",
    dot: "bg-gold-deep",
    label: "Notice",
    icon: "i",
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => {
        const s = VARIANT_STYLES[t.variant];
        return (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-line px-4 py-3 shadow-lg ${s.wrap}`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold text-white ${s.dot}`}
            >
              {s.icon}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <span className="sr-only">{s.label}: </span>
              <span className="font-medium">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-1 text-current opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
