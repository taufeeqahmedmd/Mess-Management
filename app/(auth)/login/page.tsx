import Image from "next/image";
import { LoginForm } from "./login-form";

/**
 * Staff login (plan.md §4 — mobile + password). Split-screen: warm brand panel
 * on the left, form on the right. No social / sign-up — staff accounts are
 * provisioned by an administrator.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      {/* Left: warm brand panel (hidden on small screens) */}
      <section
        className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 50% 35%, var(--gold-soft) 0%, var(--gold) 30%, var(--gold-deep) 60%, var(--terracotta) 100%)",
        }}
      >
        {/* legibility vignette: darker top + bottom, clear middle */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/35 via-transparent to-ink/55" />

        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-pill bg-surface shadow-md">
            <Image
              src="/assets/images/logo/logo.svg"
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-7"
            />
          </span>
          <span className="font-display text-xl font-semibold text-white">
            Mess Management
          </span>
        </div>

        <div className="relative">
          <h2 className="max-w-md font-display text-4xl font-semibold leading-tight text-white">
            Fast, fair meals — one tap at a time.
          </h2>
          <div className="mt-5 h-1 w-16 rounded-pill bg-gold" />
          <p className="mt-4 max-w-sm text-sm text-white/85">
            RFID coupon &amp; wallet management for the cafeteria.
          </p>
        </div>
      </section>

      {/* Right: form panel */}
      <section className="flex items-center justify-center bg-surface-2 px-6 py-10">
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

          <h1 className="font-display text-4xl font-semibold text-ink">
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
    </main>
  );
}
