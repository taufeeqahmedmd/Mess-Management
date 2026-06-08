import Image from "next/image";
import { LoginForm } from "./login-form";

/**
 * Staff login (plan.md §4 — mobile number + password). Credentials auth +
 * route gating are wired; the form posts to the loginAction server action.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 shadow-lg">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/logo/logo.svg"
            alt=""
            width={32}
            height={32}
            unoptimized
            className="size-8"
          />
          <span className="font-display text-lg font-semibold text-ink">
            Mess Management
          </span>
        </div>

        <h1 className="mt-6 font-display text-2xl font-semibold text-ink">
          Staff sign in
        </h1>
        <p className="mt-1 text-sm text-muted">Sign in with your mobile number.</p>

        <LoginForm />
      </div>
    </main>
  );
}
