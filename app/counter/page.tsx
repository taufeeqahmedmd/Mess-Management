/**
 * Full-screen RFID Counter POS (plan.md §8, frontend rules "critical path").
 * The real tap-capture input, server tap engine, photo verification, beep, and
 * offline queue land in Phases 5–6. This is the themed full-screen placeholder.
 */
export default function CounterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas p-6">
      <div className="w-full max-w-xl rounded-lg bg-surface p-10 text-center shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
          RFID Counter
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          Tap a card to begin
        </h1>
        <input
          aria-label="Card scan"
          disabled
          placeholder="Waiting for reader…"
          className="input--rfid mt-6 w-full rounded-sm border border-line-strong bg-surface-2 px-4 py-3 text-center font-mono text-lg tracking-[0.08em] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none"
        />
        <p className="mt-4 text-sm text-muted">
          Operator login + tap engine arrive in Phase 5.
        </p>
      </div>
    </main>
  );
}
