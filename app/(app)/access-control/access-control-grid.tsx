"use client";

import { useActionState, useMemo, useState } from "react";
import { ACCESS_SCREENS } from "@/lib/access-control";
import {
  saveRolePermissionsAction,
  type SaveRoleState,
} from "./actions";

type RoleData = { id: string; name: string; permissions: string[] };

const initial: SaveRoleState = {};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AccessControlGrid({ roles }: { roles: RoleData[] }) {
  const [state, action, pending] = useActionState(saveRolePermissionsAction, initial);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");

  const role = useMemo(() => roles.find((r) => r.id === roleId), [roles, roleId]);
  const locked = role?.name === "Super Admin";

  // Checked permission codes for the selected role (reset when the role changes).
  const [checkedByRole, setCheckedByRole] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)])) as Record<
        string,
        Set<string>
      >,
  );
  const checked = checkedByRole[roleId] ?? new Set<string>();

  function setChecked(next: Set<string>) {
    setCheckedByRole((prev) => ({ ...prev, [roleId]: next }));
  }

  function toggle(code: string) {
    if (locked) return;
    const next = new Set(checked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setChecked(next);
  }

  function setScreen(codes: string[], on: boolean) {
    if (locked) return;
    const next = new Set(checked);
    for (const c of codes) {
      if (on) next.add(c);
      else next.delete(c);
    }
    setChecked(next);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Role selector */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Roles">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === roleId}
            onClick={() => setRoleId(r.id)}
            className={cx(
              "rounded-pill px-4 py-2 text-sm font-medium transition-colors",
              r.id === roleId
                ? "bg-gold-soft text-ink"
                : "bg-surface-2 text-ink-2 hover:bg-gold/10 hover:text-gold-deep",
            )}
          >
            {r.name}
            {r.name === "Super Admin" ? (
              <span className="ml-1.5 text-xs text-muted">🔒</span>
            ) : null}
          </button>
        ))}
      </div>

      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="roleId" value={roleId} />

        {state.error ? (
          <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">
            Permissions saved for {role?.name}.
          </p>
        ) : null}

        {locked ? (
          <p className="rounded-sm bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            The Super Admin role always has full access and can&rsquo;t be edited.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ACCESS_SCREENS.map((screen) => {
            const codes = screen.actions.map((a) => a.permission);
            const allOn = codes.every((c) => checked.has(c));
            return (
              <div key={screen.key} className="rounded-md border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {screen.label}
                  </h3>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setScreen(codes, !allOn)}
                    className="rounded-pill px-2.5 py-1 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10 disabled:opacity-50"
                  >
                    {allOn ? "Clear" : "Select all"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {screen.actions.map((a) => {
                    const on = checked.has(a.permission) || locked;
                    return (
                      <label
                        key={a.permission}
                        className={cx(
                          "flex cursor-pointer items-center gap-2 rounded-pill border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold/20",
                          on
                            ? "border-gold bg-gold-soft text-ink"
                            : "border-line-strong bg-surface-2 text-ink-2",
                          locked && "cursor-not-allowed opacity-70",
                        )}
                      >
                        <input
                          type="checkbox"
                          name="permissions"
                          value={a.permission}
                          checked={on}
                          disabled={locked}
                          onChange={() => toggle(a.permission)}
                          className="sr-only"
                        />
                        <span aria-hidden="true">{on ? "●" : "○"}</span>
                        {a.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <button
            type="submit"
            disabled={pending || locked}
            className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : `Save ${role?.name ?? ""}`}
          </button>
        </div>
      </form>
    </div>
  );
}
