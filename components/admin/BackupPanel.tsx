"use client";

export default function BackupPanel({
  summary,
  error,
}: {
  summary: { clients: number; appointments: number; notes: number; payments: number };
  error?: string;
}) {
  return (
    <section className="panel">
      <h2>Backup to OneDrive</h2>

      <p style={{ color: "var(--ink-soft)" }}>
        Downloads everything — {summary.clients} clients,{" "}
        {summary.appointments} appointments, {summary.notes} treatment notes and{" "}
        {summary.payments} payments — as a single encrypted file. Save it into
        your OneDrive folder and it syncs and versions itself from there.
      </p>

      <div className="callout callout-warn">
        <h3>Choose a passphrase you will not lose</h3>
        <p>
          The file is encrypted with this passphrase and nothing else. Not your
          login, not the server. If you forget it, the backup cannot be opened
          by anyone — including me. Write it down somewhere physical.
        </p>
      </div>

      {/* A plain form post, not a fetch: the response is the file itself, and
          letting the browser handle the download avoids holding every client
          record in a JavaScript variable. */}
      <form
        className="form"
        method="post"
        action="/admin/backup/export"
        encType="multipart/form-data"
      >
        <div className="field">
          <label htmlFor="passphrase">Backup passphrase</label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="confirmPassphrase">Passphrase again</label>
          <input
            id="confirmPassphrase"
            name="confirmPassphrase"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>

        {error && (
          <p className="form-status" data-tone="error" role="alert">
            {error}
          </p>
        )}

        <div>
          <button className="btn btn-primary btn-small" type="submit">
            Download encrypted backup
          </button>
        </div>
      </form>

      <details style={{ marginTop: "1.5rem" }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
          How do I read a backup if this app is gone?
        </summary>
        <p style={{ fontSize: "0.9rem", marginTop: "0.75rem" }}>
          The backup is deliberately not tied to this app. Run{" "}
          <span className="mono">node scripts/decrypt-backup.mjs backup.json</span>{" "}
          and enter the passphrase — it prints readable JSON using nothing but
          Node.js. Keep a copy of that script alongside your backups.
        </p>
      </details>
    </section>
  );
}
