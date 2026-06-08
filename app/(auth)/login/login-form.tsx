"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/auth-actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4" aria-label="Sign in">
      {state.error ? (
        <p
          role="alert"
          className="rounded-sm bg-tomato-soft px-3 py-2 text-sm text-tomato"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mobile" className="text-xs font-medium text-ink-2">
          Mobile number
        </label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          required
          className="input--rfid rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 font-mono text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          placeholder="9281122104"
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
          required
          className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
