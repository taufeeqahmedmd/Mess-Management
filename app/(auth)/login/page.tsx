import { Logo } from "@/components/shell/icons";
import { ThemeToggleButton } from "@/components/shell/theme-control";
import { LoginForm } from "./login-form";

/**
 * Staff login (plan.md §4 — mobile + password). Full-page Bhojan Tricolour auth:
 * a saffron-tinted brand panel (Ashoka Chakra + tricolour rule + tagline) fills
 * the left half at full height, the form fills the right. On mobile the brand
 * collapses to a compact header band above the form. No social / sign-up — staff
 * accounts are provisioned by an administrator.
 */
export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen bg-surface md:grid-cols-[1fr_1.05fr]">
      <ThemeToggleButton className="absolute right-4 top-4 z-10 shadow-sm" />

      {/* Brand panel — full-height on desktop, a compact band on mobile */}
      <section className="flex flex-col border-b border-line bg-[linear-gradient(160deg,var(--gold-soft)_0%,var(--tray)_80%)] p-8 sm:p-10 md:border-b-0 md:border-r md:p-14 lg:p-16">
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

        <div className="mt-auto hidden pt-10 md:block">
          <h2 className="max-w-[20rem] font-display text-[34px] font-bold leading-[1.15] tracking-[-0.8px] text-ink lg:text-[40px]">
            Fast, fair meals — one tap at a time.
          </h2>
          <div className="my-5 h-1 w-11 rounded-pill bg-gold" />
          <p className="max-w-[22rem] text-[13.5px] leading-relaxed text-muted">
            RFID coupon &amp; wallet management for the cafeteria.
          </p>
        </div>
      </section>

      {/* Form panel — centered in the right half */}
      <section className="flex flex-col justify-center bg-surface px-6 py-10 sm:px-10 md:px-14 lg:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <h1 className="font-display text-[30px] font-bold tracking-[-0.6px] text-ink">Welcome back</h1>
          <p className="mt-1 text-[13px] text-muted">Sign in with your mobile number to continue.</p>

          <LoginForm />

          <p className="mt-5 text-center text-[11.5px] text-muted-2">
            Staff access only — accounts are provisioned by your administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
