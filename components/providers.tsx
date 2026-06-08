"use client";

import { ToastProvider } from "./ui/toast";
import { ConfirmProvider } from "./ui/confirm";

/**
 * App-wide client providers mounted once in the root layout: toast
 * notifications and the confirmation dialog. Available everywhere — the
 * authenticated app, the counter, public self-service and the auth screens.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
