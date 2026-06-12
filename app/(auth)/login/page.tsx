import { Logo } from "@/components/shell/icons";
import { ThemeToggleButton } from "@/components/shell/theme-control";
import { LoginForm } from "./login-form";

/**
 * Staff login (plan.md §4 — mobile + password). Bhojan Tricolour auth card: a
 * saffron-tinted brand panel (Ashoka Chakra + tricolour rule + tagline) beside
 * the white form panel. No social / sign-up — staff accounts are provisioned by
 * an administrator.
 */
export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas p-6">
      <ThemeToggleButton className="absolute right-4 top-4 shadow-sm" />

      <div className="grid min-h-[420px] w-full max-w-[880px] overflow-hidden rounded-md border border-line bg-surface shadow-sm md:grid-cols-[1fr_1.05fr]">
        {/* Brand panel — stacks above the form on mobile */}
        <section className="flex flex-col border-b border-line bg-[linear-gradient(160deg,var(--gold-soft)_0%,var(--tray)_80%)] p-8 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <Logo className="h-[34px] shrink-0" />
            <div>
              <div className="font-display text-[16.5px] font-bold tracking-[-0.2px] text-ink">Mess Management</div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted-2">
                Bhojan · <span className="font-devanagari normal-case">भोजन</span>
              </div>
            </div>
          </div>
          <div className="tricolour mt-3.5" />

          <div className="mt-auto pt-10">
            <h2 className="max-w-[15rem] font-display text-[27px] font-bold leading-[1.2] tracking-[-0.6px] text-ink">
              Fast, fair meals — one tap at a time.
            </h2>
            <div className="my-4 h-1 w-11 rounded-pill bg-gold" />
            <p className="max-w-[16rem] text-[12.5px] text-muted">
              RFID coupon &amp; wallet management for the cafeteria.
            </p>
          </div>
        </section>

        {/* Form panel */}
        <section className="flex flex-col justify-center bg-surface p-8 sm:p-10">
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Welcome back</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in with your mobile number to continue.</p>

          <LoginForm />

          <p className="mt-5 text-center text-[11.5px] text-muted-2">
            Staff access only — accounts are provisioned by your administrator.
          </p>
        </section>
      </div>
    </main>
  );
}
