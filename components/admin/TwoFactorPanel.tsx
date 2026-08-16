"use client";

import { useActionState, useState, useTransition } from "react";
import {
  beginTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  type SettingsState,
} from "@/app/admin/(protected)/settings/actions";
import { qrDataUrl } from "@/app/admin/(protected)/settings/qr";

export default function TwoFactorPanel({
  enabled,
  email,
}: {
  enabled: boolean;
  email: string;
}) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [starting, startTransition] = useTransition();

  const [confirmState, confirmAction, confirming] = useActionState<
    SettingsState,
    FormData
  >(confirmTwoFactor, {});
  const [disableState, disableAction, disabling] = useActionState<
    SettingsState,
    FormData
  >(disableTwoFactor, {});

  function start() {
    startTransition(async () => {
      const result = await beginTwoFactor();
      if (result.secret) {
        setSetup({
          secret: result.secret,
          qr: await qrDataUrl(result.secret, email),
        });
      }
    });
  }

  // Shown exactly once, immediately after setup. Only hashes reach the
  // database, so there is genuinely no way to display them again.
  if (confirmState.recoveryCodes) {
    return (
      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2>Save these recovery codes</h2>
        <div className="callout callout-warn">
          <p>
            <strong>This is the only time you&rsquo;ll see these.</strong> Print
            them, or write them down and put them somewhere safe that
            isn&rsquo;t your phone. Each one works once, and they&rsquo;re what
            gets you back in if your phone is lost or broken.
          </p>
        </div>
        <ul className="recovery-codes">
          {confirmState.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <button
          className="btn btn-secondary btn-small"
          type="button"
          onClick={() => window.print()}
        >
          Print these
        </button>
      </section>
    );
  }

  if (enabled) {
    return (
      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2>Two-factor authentication</h2>
        <p style={{ color: "var(--sage)" }}>
          <strong>✓ On.</strong> Signing in needs your password and a code from
          your phone.
        </p>

        <details>
          <summary style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
            Turn it off
          </summary>
          <form action={disableAction} className="form" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label htmlFor="disable-password">Confirm your password</label>
              <input
                id="disable-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {disableState.error && (
              <p className="form-status" data-tone="error" role="alert">
                {disableState.error}
              </p>
            )}
            <div>
              <button
                className="btn btn-secondary btn-small btn-danger"
                type="submit"
                disabled={disabling}
              >
                Turn off two-factor
              </button>
            </div>
          </form>
        </details>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginBottom: "1.5rem" }}>
      <h2>Two-factor authentication</h2>

      {!setup ? (
        <>
          <p style={{ color: "var(--ink-soft)" }}>
            Adds a six-digit code from your phone to the sign-in, so a stolen
            password isn&rsquo;t enough on its own.
          </p>
          <button
            className="btn btn-primary btn-small"
            type="button"
            onClick={start}
            disabled={starting}
          >
            {starting ? "Setting up…" : "Set it up"}
          </button>
        </>
      ) : (
        <form action={confirmAction} className="form">
          <p>
            Scan this with your authenticator app — Google Authenticator, Authy,
            1Password, or the password manager built into your iPhone.
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr}
            alt="QR code for setting up two-factor authentication"
            width={200}
            height={200}
            style={{
              border: "1px solid var(--line)",
              borderRadius: "10px",
              background: "#fff",
              padding: "0.5rem",
            }}
          />

          <p className="form-note">
            Can&rsquo;t scan it? Type this in instead:{" "}
            <span className="mono">{setup.secret}</span>
          </p>

          <input type="hidden" name="secret" value={setup.secret} />

          <div className="field">
            <label htmlFor="code">Enter the six digits it shows</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              placeholder="123456"
              autoComplete="one-time-code"
              required
            />
          </div>

          {confirmState.error && (
            <p className="form-status" data-tone="error" role="alert">
              {confirmState.error}
            </p>
          )}

          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary btn-small" type="submit" disabled={confirming}>
              {confirming ? "Checking…" : "Turn it on"}
            </button>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => setSetup(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
