"use client";

import { useState, useTransition } from "react";
import {
  runBackupNow,
  sendRemindersNow,
  type SettingsState,
} from "@/app/admin/(protected)/settings/actions";
import type { BackupRun } from "@/lib/auto-backup";

export default function AutomationPanel({
  runs,
  stale,
  emailConfigured,
  oneDriveConfigured,
  reminderCount,
}: {
  runs: BackupRun[];
  stale: boolean;
  emailConfigured: boolean;
  oneDriveConfigured: boolean;
  reminderCount: number;
}) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<SettingsState>) {
    startTransition(async () => setState(await action()));
  }

  return (
    <section className="panel" style={{ marginBottom: "1.5rem" }}>
      <h2>Automatic jobs</h2>

      {stale && (
        <div className="callout callout-warn">
          <h3>No successful backup in the last two days</h3>
          <p>
            A backup that has quietly stopped working is worse than no backup,
            because you think you have one. Run one now and check the reason
            below if it fails.
          </p>
        </div>
      )}

      <ul className="detail-list" style={{ marginBottom: "1.25rem" }}>
        <li>
          <span>Nightly backup</span>
          <span className="muted">2:30am · to disk{oneDriveConfigured && " and OneDrive"}
            {emailConfigured && ", emailed"}</span>
        </li>
        <li>
          <span>Reminder emails</span>
          <span className="muted">
            {emailConfigured ? "6pm the day before" : "needs SMTP set up"}
          </span>
        </li>
        <li>
          <span>Reminders sent</span>
          <span className="muted">{reminderCount} so far</span>
        </li>
      </ul>

      {!emailConfigured && (
        <p className="form-note" style={{ marginBottom: "1rem" }}>
          Set <span className="mono">SMTP_HOST</span> and friends to switch on
          reminder emails and emailed backups. Everything else works without it.
        </p>
      )}

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

      <div className="actions" style={{ marginTop: "1rem" }}>
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={pending}
          onClick={() => run(runBackupNow)}
        >
          {pending ? "Working…" : "Back up now"}
        </button>
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={pending}
          onClick={() => run(sendRemindersNow)}
        >
          Send tomorrow&rsquo;s reminders now
        </button>
      </div>

      {runs.length > 0 && (
        <details style={{ marginTop: "1.5rem" }}>
          <summary style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
            Recent backup runs
          </summary>
          <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
            {runs.map((run) => (
              <li key={run.id}>
                <span>
                  {run.started_at.slice(0, 16)}
                  <div className="slot-detail">{run.detail}</div>
                </span>
                <span
                  className={`badge ${
                    run.status === "ok" ? "badge-booked" : "badge-owed"
                  }`}
                >
                  {run.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
