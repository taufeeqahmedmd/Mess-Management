/**
 * Staff login (theme.md forms). Credentials auth + RBAC redirect land in Phase 1;
 * this is the themed placeholder shell.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg bg-surface p-8 shadow-lg">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Staff sign in
        </h1>
        <p className="mt-1 text-sm text-muted">Mess Management console</p>

        <form className="mt-6 flex flex-col gap-4" aria-label="Sign in">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-ink-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              disabled
              className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-ink-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled
              className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
            />
          </div>
          <button
            type="submit"
            disabled
            className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sign in
          </button>
          <p className="text-center text-xs text-muted">
            Auth arrives in Phase 1.
          </p>
        </form>
      </div>
    </main>
  );
}
