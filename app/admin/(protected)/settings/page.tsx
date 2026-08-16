import type { Metadata } from "next";
import { requireUser } from "@/app/admin/actions";
import BackupPanel from "@/components/admin/BackupPanel";
import PasswordPanel from "@/components/admin/PasswordPanel";
import TwoFactorPanel from "@/components/admin/TwoFactorPanel";
import AutomationPanel from "@/components/admin/AutomationPanel";
import { recentAudit } from "@/lib/audit";
import { backupIsStale, recentBackupRuns } from "@/lib/auto-backup";
import { backupSummary } from "@/lib/backup";
import { formatDateTime } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/email";
import { isOneDriveConfigured } from "@/lib/onedrive";
import { recentReminders } from "@/lib/reminders";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; backup?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const audit = recentAudit(40);
  const summary = backupSummary();

  const backupError =
    params.backup === "short"
      ? "Your backup passphrase needs to be at least 12 characters."
      : params.backup === "mismatch"
        ? "The two passphrases didn't match."
        : undefined;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Settings</h1>
          <p>
            Signed in as {user.name} ({user.email})
          </p>
        </div>
      </div>

      {params.welcome === "1" && (
        <div className="callout">
          <h2>Your account is set up</h2>
          <p>
            Two things worth doing right now: turn on two-factor authentication
            below, and take your first backup. Both take about a minute.
          </p>
        </div>
      )}

      {!user.totp_enabled && (
        <div className="callout callout-warn">
          <h2>Two-factor authentication is off</h2>
          <p>
            You&rsquo;re holding health records. A password on its own is one
            phishing email away from someone else reading them — turning this on
            is the single biggest thing you can do to prevent that.
          </p>
        </div>
      )}

      <div className="admin-grid admin-grid-2">
        <div>
          <TwoFactorPanel
            enabled={Boolean(user.totp_enabled)}
            email={user.email}
          />
          <PasswordPanel />
        </div>

        <div>
          <AutomationPanel
            runs={recentBackupRuns()}
            stale={backupIsStale()}
            emailConfigured={isEmailConfigured()}
            oneDriveConfigured={isOneDriveConfigured()}
            reminderCount={recentReminders(1000).length}
          />
          <BackupPanel summary={summary} error={backupError} />
        </div>
      </div>

      <section className="panel panel-flush" style={{ marginTop: "1.5rem" }}>
        <h2>Activity log</h2>
        <p style={{ padding: "0 1.5rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
          Every sign-in and every time a client record is opened. This is what
          lets you answer honestly if a client ever asks who has seen their
          notes.
        </p>
        {audit.length === 0 ? (
          <p className="empty">Nothing logged yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Record</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td>
                      <span className="badge">{entry.action}</span>
                      {entry.detail && (
                        <div className="slot-detail">{entry.detail}</div>
                      )}
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {entry.entity
                        ? `${entry.entity} ${entry.entity_id ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {entry.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
