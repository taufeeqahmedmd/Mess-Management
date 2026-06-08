/**
 * Public self-service lookup (plan.md §10, module 10). Unauthenticated balance +
 * filtered history. The real lookup hits a rate-limited Route Handler in Phase 8;
 * this is the themed placeholder.
 */
export default function LookupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-lg bg-surface p-8 shadow-lg">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Check your balance
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Enter your ID to view your wallet balance and recent meals.
        </p>
        <form className="mt-6 flex gap-2" aria-label="Balance lookup">
          <input
            id="code"
            name="code"
            type="text"
            disabled
            placeholder="Admission / Employee ID"
            className="input--rfid min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 font-mono tracking-[0.04em] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          />
          <button
            type="submit"
            disabled
            className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            Look up
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">Self-service arrives in Phase 8.</p>
      </div>
    </main>
  );
}
