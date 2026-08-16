"use client";

import { useActionState } from "react";
import {
  changePassword,
  type SettingsState,
} from "@/app/admin/(protected)/settings/actions";

export default function PasswordPanel() {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    changePassword,
    {},
  );

  return (
    <section className="panel">
      <h2>Change your password</h2>

      <form action={formAction} className="form">
        <div className="field">
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
          <p className="form-note">At least 12 characters.</p>
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">New password again</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
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
        {state.success && (
          <p className="form-status" role="status">
            {state.success}
          </p>
        )}

        <div>
          <button className="btn btn-primary btn-small" type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
