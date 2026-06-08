"use client";

import { useActionState, useMemo, useState } from "react";
import { ACCESS_SCREENS } from "@/lib/access-control";
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
  const [state, action, pending] = useActionState(saveAccessControlAction, initial);

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

  const allCodes = useMemo(
    () => ACCESS_SCREENS.flatMap((s) => s.actions.map((a) => a.permission)),
    [],
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">
          {state.savedRoles && state.savedRoles.length
            ? `Permissions saved for ${state.savedRoles.join(", ")}.`
            : "No changes to save."}
        </p>
      ) : null}

      {/* Matrix: screens/actions down the rows, roles across the columns. */}
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-4 py-3 text-left align-bottom"
              >
                <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Screen / Action
                </span>
              </th>
              {roles.map((r) => {
                const locked = isLocked(r.name);
                const set = checkedByRole[r.id];
                const allOn = locked || allCodes.every((c) => set.has(c));
                return (
                  <th
                    key={r.id}
                    scope="col"
                    className="min-w-[8.5rem] border-l border-line px-3 py-3 text-center align-bottom"
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="flex items-center gap-1 font-display text-sm font-semibold text-ink">
                        {r.name}
                        {locked ? <span className="text-xs text-muted" aria-hidden="true">🔒</span> : null}
                      </span>
                      {locked ? (
                        <span className="text-[0.7rem] text-muted">Full access</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMany(r.id, allCodes, !allOn)}
                          className="rounded-pill px-2 py-0.5 text-[0.7rem] font-medium text-gold-deep transition-colors hover:bg-gold/10"
                        >
                          {allOn ? "Clear all" : "Grant all"}
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ACCESS_SCREENS.map((screen) => {
              const codes = screen.actions.map((a) => a.permission);
              return (
                <RowGroup
                  key={screen.key}
                  screen={screen}
                  codes={codes}
                  roles={roles}
                  checkedByRole={checkedByRole}
                  isLocked={isLocked}
                  toggle={toggle}
                  setMany={setMany}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty ? (
          <>
            <button
              type="button"
              onClick={resetAll}
              disabled={pending}
              className="rounded-sm px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
            >
              Discard
            </button>
            <span className="text-sm text-ink-2">
              Unsaved changes to{" "}
              <span className="font-medium text-ink">{dirtyRoles.map((r) => r.name).join(", ")}</span>.
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">All changes saved.</span>
        )}
      </div>
    </form>
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
      {/* Screen band: name in the first column, a per-role "all actions on this
          screen" toggle in each role column. */}
      <tr className="border-b border-line bg-surface-2/60">
        <th
          scope="rowgroup"
          className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 text-left font-display text-sm font-semibold text-ink"
        >
          {screen.label}
        </th>
        {roles.map((r) => {
          const locked = isLocked(r.name);
          const set = checkedByRole[r.id];
          const allOn = locked || codes.every((c) => set.has(c));
          return (
            <td key={r.id} className="border-l border-line px-3 py-2.5 text-center align-middle">
              {locked ? (
                <span className="text-xs text-muted" aria-hidden="true">
                  —
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMany(r.id, codes, !allOn)}
                  className="rounded-pill px-2 py-0.5 text-[0.7rem] font-medium text-gold-deep transition-colors hover:bg-gold/10"
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
        <tr key={a.permission} className="border-b border-line last:border-b-0">
          <th
            scope="row"
            className="sticky left-0 z-10 bg-surface py-2 pl-8 pr-4 text-left font-normal text-ink-2"
          >
            {a.label}
          </th>
          {roles.map((r) => {
            const locked = isLocked(r.name);
            const on = locked || checkedByRole[r.id].has(a.permission);
            return (
              <td key={r.id} className="border-l border-line px-3 py-1.5 text-center">
                <label
                  className={cx(
                    "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold/30",
                    on
                      ? "border-sage bg-sage-soft text-sage-deep"
                      : "border-line-strong bg-surface-2 text-muted hover:border-sage/50",
                    locked && "cursor-not-allowed opacity-80",
                  )}
                  title={`${a.label} — ${r.name}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => toggle(r.id, a.permission)}
                    className="sr-only"
                    aria-label={`${screen.label} ${a.label} for ${r.name}`}
                  />
                  <span aria-hidden="true" className="text-sm leading-none">
                    {on ? "✓" : ""}
                  </span>
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
