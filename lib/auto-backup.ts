import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encryptBackup, gatherBackup } from "./backup";
import { nowSql, todaySql } from "./dates";
import { getDb } from "./db";
import { isEmailConfigured, sendMail } from "./email";
import { isOneDriveConfigured, pruneOneDrive, uploadToOneDrive } from "./onedrive";
import "server-only";

/**
 * The nightly backup.
 *
 * A manual backup depends on somebody remembering, and forgotten backups are
 * the failure mode that actually bites — far more often than lost keys or
 * break-ins. This runs whether anyone thinks about it or not.
 *
 * Every run is written to `backup_runs` including failures, so a backup that
 * has been quietly broken for three weeks is visible on the settings page
 * rather than discovered during a disaster.
 */

const BACKUP_DIR = process.env.BACKUP_DIR ?? "./data/backups";
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

export type BackupOutcome = {
  status: "ok" | "failed" | "skipped";
  filename?: string;
  sizeBytes?: number;
  destinations: string[];
  detail: string;
};

function record(outcome: BackupOutcome, startedAt: string) {
  getDb()
    .prepare(
      `INSERT INTO backup_runs (started_at, status, destination, filename, size_bytes, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      startedAt,
      outcome.status,
      outcome.destinations.join(", ") || null,
      outcome.filename ?? null,
      outcome.sizeBytes ?? null,
      outcome.detail,
    );
}

export async function runNightlyBackup(): Promise<BackupOutcome> {
  const startedAt = nowSql();

  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!passphrase || passphrase.length < 12) {
    // Deliberately not falling back to an unencrypted backup. A readable copy
    // of every client's health record sitting on disk would be worse than no
    // automatic backup at all.
    const outcome: BackupOutcome = {
      status: "skipped",
      destinations: [],
      detail:
        "BACKUP_PASSPHRASE is not set (or is under 12 characters), so no automatic backup was taken.",
    };
    record(outcome, startedAt);
    return outcome;
  }

  try {
    const file = encryptBackup(gatherBackup(), passphrase);
    const filename = `practice-backup-${todaySql()}.json`;
    const destinations: string[] = [];
    const problems: string[] = [];

    // 1. Local disk, on the persistent volume. Always happens, and is the
    //    copy that survives if email and OneDrive are both misconfigured.
    try {
      mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
      writeFileSync(join(BACKUP_DIR, filename), file, { mode: 0o600 });
      destinations.push("disk");
    } catch (error) {
      problems.push(`disk: ${(error as Error).message}`);
    }

    // 2. OneDrive, so a copy exists somewhere the server can't reach.
    if (isOneDriveConfigured()) {
      try {
        await uploadToOneDrive(filename, file);
        destinations.push("onedrive");
        await pruneOneDrive(KEEP_DAYS).catch(() => 0);
      } catch (error) {
        problems.push(`onedrive: ${(error as Error).message}`);
      }
    }

    // 3. Email, as a belt-and-braces off-site copy that needs no setup beyond
    //    SMTP. The attachment is the encrypted file, never anything readable.
    if (isEmailConfigured() && process.env.BACKUP_EMAIL_TO) {
      const mail = await sendMail({
        to: process.env.BACKUP_EMAIL_TO,
        subject: `Practice backup — ${todaySql()}`,
        text:
          `Attached is tonight's encrypted backup.\n\n` +
          `It can only be opened with your backup passphrase. To read it:\n` +
          `  node scripts/decrypt-backup.mjs ${filename}\n\n` +
          `Keep a copy of that script wherever you keep these files.\n`,
        attachments: [{ filename, content: file }],
      });
      if (mail.sent) destinations.push("email");
      else problems.push(`email: ${mail.detail}`);
    }

    pruneLocalBackups();

    const outcome: BackupOutcome = {
      status: destinations.length > 0 ? "ok" : "failed",
      filename,
      sizeBytes: file.byteLength,
      destinations,
      detail:
        problems.length > 0
          ? `Saved to ${destinations.join(", ") || "nowhere"}. Problems: ${problems.join("; ")}`
          : `Saved to ${destinations.join(", ")}.`,
    };

    record(outcome, startedAt);
    return outcome;
  } catch (error) {
    const outcome: BackupOutcome = {
      status: "failed",
      destinations: [],
      detail: error instanceof Error ? error.message : String(error),
    };
    record(outcome, startedAt);
    return outcome;
  }
}

/** Deletes local backup files past the retention window. */
function pruneLocalBackups() {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(BACKUP_DIR)) {
      if (!name.startsWith("practice-backup-")) continue;
      const path = join(BACKUP_DIR, name);
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    }
  } catch {
    // A failed tidy-up is not worth failing a good backup over.
  }
}

export type BackupRun = {
  id: number;
  started_at: string;
  status: string;
  destination: string | null;
  filename: string | null;
  size_bytes: number | null;
  detail: string | null;
};

export function recentBackupRuns(limit = 14): BackupRun[] {
  return getDb()
    .prepare(
      `SELECT * FROM backup_runs ORDER BY started_at DESC, id DESC LIMIT ?`,
    )
    .all(limit) as BackupRun[];
}

/** True when the last successful backup is older than it should be. */
export function backupIsStale(): boolean {
  const row = getDb()
    .prepare(
      `SELECT started_at FROM backup_runs WHERE status = 'ok'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as { started_at: string } | undefined;

  if (!row) return true;
  const age = Date.now() - new Date(row.started_at.replace(" ", "T")).getTime();
  return age > 48 * 60 * 60 * 1000;
}
