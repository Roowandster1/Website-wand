"use client";

import { useActionState } from "react";
import { createFirstUser, type SetupState } from "./actions";

export default function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    createFirstUser,
    {},
  );

  return (
    <form action={formAction} className="form">
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" type="text" autoComplete="name" required />
      </div>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="form-note">
          At least 12 characters. Three unrelated words with a number is both
          easier to remember and harder to guess than something like
          &ldquo;Massage2024!&rdquo;.
        </p>
      </div>

      <div className="field">
        <label htmlFor="confirm">Password again</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create my account"}
        </button>
      </div>
    </form>
  );
}
