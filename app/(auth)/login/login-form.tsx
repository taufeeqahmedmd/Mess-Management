"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { loginAction, type LoginState } from "@/lib/auth-actions";

const initial: LoginState = {};

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <path d="M5 4h3l1.6 4.5-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2L19 16v3a2 2 0 0 1-2 2A16 16 0 0 1 3 7a2 2 0 0 1 2-3z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.4 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.1 6.1A18 18 0 0 0 2 11s3.6 7 10 7a10.7 10.7 0 0 0 3.9-.7" />
    </svg>
  );
}

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-4 py-3 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const [show, setShow] = useState(false);
  const toast = useToast();
  const lastState = useRef<LoginState>(initial);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.error) toast.error(state.error);
  }, [state, toast]);

  return (
    <form action={action} className="mt-8 flex flex-col gap-5" aria-label="Sign in">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mobile" className="text-xs font-semibold text-ink-2">
          Mobile Number
        </label>
        <div className="relative">
          <input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            required
            placeholder="Enter your mobile number"
            className={`${inputClass} pr-11 font-mono`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted">
            <PhoneIcon />
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-semibold text-ink-2">
            Password
          </label>
          <span className="text-xs text-muted">Forgot? Ask your admin.</span>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-2 grid place-items-center rounded-sm px-1.5 text-muted transition-colors hover:text-ink-2 focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-sm bg-gold px-4 py-3 text-center font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
