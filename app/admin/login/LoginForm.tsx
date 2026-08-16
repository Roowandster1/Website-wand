"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  // Once the password has been accepted, the form becomes a code-only step.
  // The password is deliberately not carried over — a token proving the first
  // factor passed is held server-side instead.
  const awaitingCode = Boolean(state.needsCode && state.pendingToken);

  return (
    <form action={formAction} className="form">
      {awaitingCode ? (
        <>
          <input type="hidden" name="pendingToken" value={state.pendingToken} />
          <input type="hidden" name="email" value={state.email ?? ""} />

          <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
            Signing in as <strong>{state.email}</strong>.
          </p>

          <div className="field">
            <label htmlFor="code">Six-digit code</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
              required
            />
            <p className="form-note">
              From your authenticator app. A recovery code works too.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={state.email}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </>
      )}

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Checking…" : awaitingCode ? "Confirm code" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
