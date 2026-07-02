"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ACCESS_SCREENS } from "@/lib/access-control";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { saveAccessControlAction, type SaveRoleState } from "./actions";

type RoleData = { id: string; name: string; permissions: string[] };

const initial: SaveRoleState = {};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Stable signature of a permission set for cheap dirty-checking. */
function sig(set: Set<string>) {
  return [...set].sort().join("|");
}

export function AccessControlGrid({ roles }: { roles: RoleData[] }) {
  const [state, dispatch, actionPending] = useActionState(saveAccessControlAction, initial);
  const confirm = useConfirm();
  const toast = useToast();
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const lastState = useRef<SaveRoleState>(initial);

  // Surface the save outcome as a toast (in addition to the inline banner).
  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.error) {
      toast.error(state.error);
    } else if (state.success) {
      toast.success(
        state.savedRoles && state.savedRoles.length
          ? `Permissions saved for ${state.savedRoles.join(", ")}.`
          : "No changes to save.",
      );
    }
  }, [state, toast]);

  // Per-role checked permission codes. The baseline (server truth) is kept
  // separately so we can dirty-check and reset.
  const baseline = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.id, sig(new Set(r.permissions))])),
    [roles],
  );
  const [checkedByRole, setCheckedByRole] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])),
  );

  const isLocked = (name: string) => name === "Super Admin";
  const dirtyRoles = roles.filter((r) => !isLocked(r.name) && sig(checkedByRole[r.id]) !== baseline[r.id]);
  const dirty = dirtyRoles.length > 0;

  // Only editable roles are submitted to the server.
  const payload = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const r of roles) {
      if (!isLocked(r.name)) out[r.id] = [...checkedByRole[r.id]];
    }
    return JSON.stringify(out);
  }, [roles, checkedByRole]);

  function mutate(roleId: string, fn: (next: Set<string>) => void) {
    setCheckedByRole((prev) => {
      const next = new Set(prev[roleId]);
      fn(next);
      return { ...prev, [roleId]: next };
    });
  }

  function toggle(roleId: string, code: string) {
    mutate(roleId, (next) => (next.has(code) ? next.delete(code) : next.add(code)));
  }

  function setMany(roleId: string, codes: string[], on: boolean) {
    mutate(roleId, (next) => {
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
    });
  }

  function resetAll() {
    setCheckedByRole(Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await confirm({
      title: "Save permission changes",
      message: dirtyRoles.length
        ? `Apply permission changes to ${dirtyRoles.map((r) => r.name).join(", ")}?`
        : "Save permission changes?",
      confirmLabel: "Yes, save",
    });
    if (!ok) return;
    // Build the payload from state directly — don't re-read the form element after
    // the await (a controlled hidden input can be out of sync at that point).
    const formData = new FormData();
    formData.set("payload", payload);
    startTransition(() => dispatch(formData));
  }

  const allCodes = useMemo(
    () => ACCESS_SCREENS.flatMap((s) => s.actions.map((a) => a.permission)),
    [],
  );
  const total = allCodes.length;

  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const screens = useMemo(() => {
    if (!q) return ACCESS_SCREENS;
    return ACCESS_SCREENS.map((s) => {
      if (s.label.toLowerCase().includes(q)) return s;
      const actions = s.actions.filter((a) => a.label.toLowerCase().includes(q));
      return { ...s, actions };
    }).filter((s) => s.label.toLowerCase().includes(q) || s.actions.length > 0);
  }, [q]);

  const roleCount = (r: RoleData) =>
    isLocked(r.name) ? total : allCodes.filter((c) => checkedByRole[r.id].has(c)).length;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-20">
      <input type="hidden" name="payload" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm border border-sage-soft-2 bg-sage-soft px-3 py-2.5 text-[12.5px] font-medium text-sage-deep">
          {state.savedRoles && state.savedRoles.length
            ? `Permissions saved for ${state.savedRoles.join(", ")}.`
            : "No changes to save."}
        </p>
      ) : null}

      {/* Toolbar: filter + legend */}
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="relative max-w-[320px] flex-1">
          <SearchGlyph className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-2" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter screens or actions…"
            aria-label="Filter screens or actions"
            className="w-full rounded-sm border border-line-strong bg-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          />
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-3.5 w-6 items-center justify-end rounded-full bg-sage pr-0.5"><span className="size-2.5 rounded-full bg-white" /></span>
            Granted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-3.5 w-6 items-center justify-start rounded-full bg-line-strong pl-0.5"><span className="size-2.5 rounded-full bg-white" /></span>
            Not granted
          </span>
        </div>
      </div>

      {/* Matrix: screens/actions down the rows, roles across the columns. */}
      <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-[200px] border-b border-line bg-surface-2 px-[18px] py-3.5 text-left align-bottom text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2">
                Screen / Action
              </th>
              {roles.map((r) => {
                const locked = isLocked(r.name);
                const count = roleCount(r);
                const allOn = count === total;
                return (
                  <th key={r.id} scope="col" className="min-w-[132px] border-b border-l border-line bg-surface-2 px-3.5 pb-3 pt-3.5 text-center align-bottom">
                    <span className="flex items-center justify-center gap-1.5 font-display text-[15px] font-bold text-ink">
                      {r.name}
                      {locked ? <LockGlyph className="size-3.5 text-gold-deep" /> : null}
                    </span>
                    <div className="mt-1.5 text-[11px]">
                      {locked ? (
                        <span className="font-semibold text-gold-deep">Full access</span>
                      ) : (
                        <button type="button" onClick={() => setMany(r.id, allCodes, !allOn)} className="font-semibold text-gold-deep hover:underline">
                          {allOn ? "Clear all" : "Grant all"}
                        </button>
                      )}
                    </div>
                    <div className="mx-3.5 mt-2 h-1 overflow-hidden rounded-full bg-line">
                      <span className={`block h-full rounded-full transition-[width] ${allOn ? "bg-gold" : "bg-sage"}`} style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] tabular-nums text-muted-2">{count} / {total}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {screens.length === 0 ? (
              <tr>
                <td colSpan={roles.length + 1} className="px-5 py-10 text-center text-[13px] text-muted-2">No screens or actions match &ldquo;{filter}&rdquo;.</td>
              </tr>
            ) : (
              screens.map((screen) => (
                <RowGroup
                  key={screen.key}
                  screen={screen}
                  codes={screen.actions.map((a) => a.permission)}
                  roles={roles}
                  checkedByRole={checkedByRole}
                  isLocked={isLocked}
                  toggle={toggle}
                  setMany={setMany}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 z-10 -mx-5 flex items-center gap-3.5 border-t border-line bg-canvas/90 px-5 py-3 backdrop-blur-md sm:-mx-7 sm:px-7">
        <button type="submit" disabled={pending || !dirty} className="rounded-sm bg-gold px-6 py-2.5 text-[13.5px] font-semibold text-white shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty ? (
          <span className="text-[12.5px] font-medium text-gold-deep">
            Unsaved changes to <span className="text-ink">{dirtyRoles.map((r) => r.name).join(", ")}</span>
          </span>
        ) : state.success ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-sage-deep"><CheckGlyph className="size-3.5" />Saved</span>
        ) : (
          <span className="text-[12.5px] text-muted">All changes saved</span>
        )}
        <div className="ml-auto">
          <button type="button" onClick={resetAll} disabled={pending || !dirty} className="rounded-sm px-3.5 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40">
            Discard
          </button>
        </div>
      </div>
    </form>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 13l4 4 10-10" />
    </svg>
  );
}
function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Permission on/off switch. */
function Toggle({
  on,
  locked,
  onToggle,
  label,
}: {
  on: boolean;
  locked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={locked}
      onClick={onToggle}
      className={cx(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full align-middle transition-colors focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30",
        on ? "bg-sage" : "bg-line-strong",
        locked && "cursor-not-allowed opacity-65",
      )}
    >
      <span className={cx("inline-block size-[16px] rounded-full bg-white shadow-sm transition-transform", on ? "translate-x-[19px]" : "translate-x-[3px]")} />
    </button>
  );
}

function RowGroup({
  screen,
  codes,
  roles,
  checkedByRole,
  isLocked,
  toggle,
  setMany,
}: {
  screen: (typeof ACCESS_SCREENS)[number];
  codes: string[];
  roles: RoleData[];
  checkedByRole: Record<string, Set<string>>;
  isLocked: (name: string) => boolean;
  toggle: (roleId: string, code: string) => void;
  setMany: (roleId: string, codes: string[], on: boolean) => void;
}) {
  return (
    <>
      {/* Screen band: name + a per-role "all actions on this screen" toggle. */}
      <tr>
        <th scope="rowgroup" className="sticky left-0 z-10 border-b border-t border-line bg-surface-2 px-[18px] py-2.5 text-left text-[13px] font-bold text-ink">
          {screen.label}
        </th>
        {roles.map((r) => {
          const locked = isLocked(r.name);
          const allOn = locked || codes.every((c) => checkedByRole[r.id].has(c));
          return (
            <td key={r.id} className="border-b border-t border-l border-line bg-surface-2 px-3.5 py-2.5 text-center text-[11.5px] font-semibold">
              {locked ? (
                <span className="text-muted-2" aria-hidden="true">—</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMany(r.id, codes, !allOn)}
                  className={allOn ? "text-ink-2 hover:text-tomato hover:underline" : "text-gold-deep hover:underline"}
                  aria-label={`${allOn ? "Clear" : "Grant"} all ${screen.label} actions for ${r.name}`}
                >
                  {allOn ? "Clear" : "All"}
                </button>
              )}
            </td>
          );
        })}
      </tr>

      {/* One row per action. */}
      {screen.actions.map((a) => (
        <tr key={a.permission} className="group">
          <th scope="row" className="sticky left-0 z-[1] border-b border-line bg-surface py-2.5 pl-8 pr-[18px] text-left text-[13px] font-normal text-ink group-hover:bg-surface-2">
            {a.label}
          </th>
          {roles.map((r) => {
            const locked = isLocked(r.name);
            const on = locked || checkedByRole[r.id].has(a.permission);
            return (
              <td key={r.id} className="border-b border-l border-line px-3.5 py-2 text-center">
                <Toggle
                  on={on}
                  locked={locked}
                  onToggle={() => toggle(r.id, a.permission)}
                  label={`${screen.label} ${a.label} for ${r.name}`}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
