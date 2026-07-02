"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/ui/controls";
import { UploadGlyph, XGlyph } from "@/components/ui/glyphs";
import { importRechargesAction, type RechargeImportReport } from "./import/actions";

const initial: RechargeImportReport = {};

function fmtSize(bytes: number) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Import-recharges modal (mockup: dropzone → result stats). Wraps the existing
 * `importRechargesAction` server action unchanged — confirm-before-write + toast
 * are preserved; money still moves server-side, the UI only renders the report.
 */
export function RechargeImportModal() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // The result view is derived from the action state; `forceUpload` lets the
  // user go back to the dropzone ("Import another file") without resetting the
  // server result, avoiding a setState-in-effect.
  const [forceUpload, setForceUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const last = useRef<RechargeImportReport>(initial);

  const [state, dispatch, actionPending] = useActionState(importRechargesAction, initial);
  const confirm = useConfirm();
  const toast = useToast();
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) {
      toast.error(state.error);
    } else if (state.total != null) {
      const failed = state.failures?.length ?? 0;
      toast.success(`Recharged ${state.created} of ${state.total} rows${failed ? `, ${failed} failed` : ""}.`);
    }
  }, [state, toast]);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error("Please choose a .csv file.");
      return;
    }
    setFile(f);
  }

  function reset() {
    setFile(null);
    setForceUpload(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function openModal() {
    reset();
    setOpen(true);
  }
  function close() {
    setOpen(false);
    reset();
  }

  async function runImport() {
    if (!file) return;
    const ok = await confirm({
      title: "Import recharges",
      message: "Apply recharges from the selected CSV file? This grants meal coupons to cardholders.",
      confirmLabel: "Yes, import",
      tone: "danger",
    });
    if (!ok) return;
    setForceUpload(false);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(() => dispatch(fd));
  }

  const applied = state.created ?? 0;
  const skipped = state.failures?.length ?? Math.max(0, (state.total ?? 0) - applied);
  const view: "upload" | "result" = state.total != null && !state.error && !forceUpload ? "result" : "upload";

  return (
    <>
      <button type="button" onClick={openModal} className={BTN_GHOST}>
        <UploadGlyph />
        Import
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          className="animate-overlay-fade fixed inset-0 z-50 grid place-items-center bg-ink/45 p-5 backdrop-blur-sm"
        >
          <div className="animate-dialog-pop flex max-h-[calc(100vh-40px)] w-full max-w-[520px] flex-col overflow-hidden rounded-md border border-line bg-surface shadow-lg">
            <div className="flex items-start gap-3 px-5 pt-5">
              <span className="mt-1 h-[17px] w-1 shrink-0 rounded-full bg-gold" />
              <div className="min-w-0">
                <h2 id="import-title" className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Import recharges</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Bulk-apply recharges from a CSV. Valid rows grant coupons and record the recharge value;
                  invalid rows are skipped and reported.{" "}
                  <a href="/api/recharges/sample" className="font-semibold text-gold-deep hover:underline">Download a sample template</a>
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="ml-auto grid size-8 shrink-0 place-items-center rounded-pill border border-line-strong text-muted transition-colors hover:bg-gold-soft hover:text-gold-deep">
                <XGlyph className="size-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-5 pt-4">
              {view === "upload" ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                    className={`flex w-full flex-col items-center rounded-md border border-dashed px-5 py-7 text-center transition-colors ${dragOver ? "border-gold bg-gold-soft" : "border-line-strong bg-surface-2 hover:border-gold hover:bg-gold-soft"}`}
                  >
                    <span className="mb-3 grid size-[42px] place-items-center rounded-md bg-gold-soft-2 text-gold-deep">
                      <UploadGlyph className="size-5" />
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink">
                      <span className="text-gold-deep">Choose a CSV file</span> or drag it here
                    </span>
                    <span className="mt-1 text-[11.5px] text-muted-2">.csv up to 5 MB</span>
                  </button>
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => pickFile(e.target.files?.[0])} />

                  {file ? (
                    <div className="mt-3 flex items-center gap-3 rounded-md border border-sage-soft-2 bg-sage-soft px-3.5 py-3">
                      <span className="grid size-[34px] shrink-0 place-items-center rounded-sm bg-sage-soft-2 text-sage-deep">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                          <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="m9 14 2 2 4-4" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block break-all text-[13px] font-semibold text-ink">{file.name}</span>
                        <span className="text-[11px] text-muted">{fmtSize(file.size)}</span>
                      </span>
                      <button type="button" onClick={reset} className="ml-auto rounded-sm px-2 py-1 text-[12px] font-semibold text-tomato transition-colors hover:bg-tomato-soft">Remove</button>
                    </div>
                  ) : null}

                  <p className="mt-3.5 rounded-sm border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-muted-2">
                    <b className="font-semibold text-muted">Columns:</b> RFID, one column per meal (e.g. &ldquo;BKF Coupons&rdquo;), paymentMode, validTill, remarks.
                    Only <b className="font-semibold text-muted">RFID</b> plus at least one coupon count is required; the wallet value is computed from coupons × rate. Dates accept YYYY-MM-DD or DD-MM-YYYY.
                  </p>

                  <div className="mt-4 flex justify-end gap-2.5">
                    <button type="button" onClick={close} className={BTN_GHOST}>Cancel</button>
                    <button type="button" onClick={runImport} disabled={!file || pending} className={BTN_PRIMARY}>
                      {pending ? "Importing…" : "Import"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3.5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-md border border-sage-soft-2 bg-[linear-gradient(160deg,var(--sage-soft)_0%,var(--surface)_70%)] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Applied</div>
                      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-sage-deep">{applied}</div>
                    </div>
                    <div className="rounded-md border border-tomato/30 bg-[linear-gradient(160deg,var(--tomato-soft)_0%,var(--surface)_70%)] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Skipped</div>
                      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-tomato">{skipped}</div>
                    </div>
                  </div>
                  {state.failures && state.failures.length > 0 ? (
                    <ul className="overflow-hidden rounded-md border border-line">
                      {state.failures.map((f) => (
                        <li key={f.row} className="flex items-baseline gap-2.5 border-b border-line px-3.5 py-2.5 text-[12.5px] last:border-0">
                          <span className="shrink-0 font-mono font-bold tabular-nums text-tomato">Row {f.row}</span>
                          <span className="text-muted">{f.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex justify-end gap-2.5">
                    <button type="button" onClick={reset} className={BTN_GHOST}>Import another file</button>
                    <button type="button" onClick={close} className={BTN_PRIMARY}>Done</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
