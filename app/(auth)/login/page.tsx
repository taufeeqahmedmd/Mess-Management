import Image from "next/image";
import { LoginForm } from "./login-form";

/**
 * Staff login (plan.md §4 — mobile + password). "Warm Cafeteria" floating panel
 * on the canvas: cream tray brand side + white surface form side. No social /
 * sign-up — staff accounts are provisioned by an administrator.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-lg bg-surface shadow-lg md:grid-cols-2">
        {/* Left: cream brand panel (hidden on small screens) */}
        <section className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-gradient-to-b from-tray-2 to-tray p-10 md:flex">
          {/* soft diffuse warmth */}
          <div className="pointer-events-none absolute -right-16 top-12 size-56 rounded-pill bg-gold-soft opacity-60 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-10 size-40 rounded-pill bg-sage-soft opacity-50 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <Image
              src="/assets/images/logo/logo.svg"
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8"
            />
            <span className="font-display text-xl font-semibold text-ink">
              Mess Management
            </span>
          </div>

          <div className="relative">
            <h2 className="max-w-xs font-display text-3xl font-semibold leading-tight text-ink">
              Fast, fair meals — one tap at a time.
            </h2>
            <div className="mt-5 h-1 w-16 rounded-pill bg-gold" />
            <p className="mt-4 max-w-xs text-sm text-ink-2">
              RFID coupon &amp; wallet management for the cafeteria.
            </p>
          </div>
        </section>

        {/* Right: form panel */}
        <section className="flex items-center justify-center bg-surface px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2 md:hidden">
              <Image
                src="/assets/images/logo/logo.svg"
                alt=""
                width={28}
                height={28}
                unoptimized
                className="size-7"
              />
              <span className="font-display text-lg font-semibold text-ink">
                Mess Management
              </span>
            </div>

            <h1 className="font-display text-3xl font-semibold text-ink">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-ink-2">
              Sign in with your mobile number to continue.
            </p>

            <LoginForm />

            <p className="mt-8 text-center text-xs text-muted">
              Staff access only — accounts are provisioned by your administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
