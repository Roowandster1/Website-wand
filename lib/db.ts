import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "server-only";

/**
 * SQLite is deliberate rather than a compromise. For a single practitioner the
 * whole dataset is a few megabytes, and keeping it in one file means the backup
 * story is "copy one file" — which is exactly what makes the encrypted OneDrive
 * backup possible. It does mean the app needs a host with a persistent disk;
 * it will not survive on a serverless platform with an ephemeral filesystem.
 */

const DB_PATH = process.env.DATABASE_PATH ?? "./data/practice.db";

let instance: Database.Database | null = null;

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      email             TEXT NOT NULL UNIQUE,
      name              TEXT NOT NULL,
      password_hash     TEXT NOT NULL,
      totp_secret       TEXT,
      totp_enabled      INTEGER NOT NULL DEFAULT 0,
      recovery_codes    TEXT,
      failed_attempts   INTEGER NOT NULL DEFAULT 0,
      locked_until      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at    TEXT NOT NULL,
      user_agent    TEXT,
      ip            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    /* Names and contact details stay queryable so search works. Everything
       clinical lives in the *_enc columns and is AES-256-GCM encrypted, so a
       stolen database file alone does not expose health data. */
    CREATE TABLE IF NOT EXISTS clients (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name            TEXT NOT NULL,
      last_name             TEXT NOT NULL,
      email                 TEXT,
      phone                 TEXT,
      date_of_birth         TEXT,
      address               TEXT,
      notes_enc             TEXT,
      health_conditions_enc TEXT,
      medications_enc       TEXT,
      allergies_enc         TEXT,
      contraindications_enc TEXT,
      gp_details_enc        TEXT,
      consent_given_at      TEXT,
      consent_notes         TEXT,
      is_archived           INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(is_archived);

    CREATE TABLE IF NOT EXISTS appointments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      treatment      TEXT NOT NULL,
      starts_at      TEXT NOT NULL,
      duration_mins  INTEGER NOT NULL DEFAULT 60,
      status         TEXT NOT NULL DEFAULT 'booked',
      price_pence    INTEGER NOT NULL DEFAULT 0,
      notes_enc      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(starts_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);

    /* The clinical record. Kept separate from appointments because insurers
       generally require these retained for years after the last visit. */
    CREATE TABLE IF NOT EXISTS treatment_notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      recorded_at     TEXT NOT NULL,
      body_enc        TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_client ON treatment_notes(client_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS payments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
      amount_pence    INTEGER NOT NULL,
      method          TEXT NOT NULL DEFAULT 'cash',
      paid_at         TEXT NOT NULL,
      note            TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments(paid_at);
    CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);

    /* Who looked at whose record, and when. Needed to answer a subject access
       request honestly, and to show the ICO a trail after any incident. */
    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action       TEXT NOT NULL,
      entity       TEXT,
      entity_id    INTEGER,
      detail       TEXT,
      ip           TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

    /* Between the password step and the 2FA code step.
       React resets a form after a server action runs, so the password field is
       empty by the time the code is entered — and re-sending the password in a
       hidden field would be worse than useless. Instead the first factor mints
       a short-lived single-use token that proves it passed. */
    CREATE TABLE IF NOT EXISTS pending_logins (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_logins(expires_at);

    CREATE TABLE IF NOT EXISTS login_attempts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(identifier, created_at);
  `);
}

export function getDb(): Database.Database {
  if (instance) return instance;

  const dir = dirname(DB_PATH);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  migrate(db);

  instance = db;
  return db;
}
