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
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
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

    /* First-party page views for the public site.
       No cookies, no third party, no identifiers — just a count of which pages
       were looked at and roughly where visitors came from. That is enough to
       be useful and little enough to avoid needing a consent banner. */
    CREATE TABLE IF NOT EXISTS page_views (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT NOT NULL,
      referrer    TEXT,
      viewed_at   TEXT NOT NULL,
      viewed_date TEXT NOT NULL,
      is_mobile   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_views_date ON page_views(viewed_date);
    CREATE INDEX IF NOT EXISTS idx_views_path ON page_views(path);

    /* A record of every automatic backup, so a silently failing backup is
       visible rather than discovered during a disaster. */
    CREATE TABLE IF NOT EXISTS backup_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at   TEXT NOT NULL,
      status       TEXT NOT NULL,
      destination  TEXT,
      filename     TEXT,
      size_bytes   INTEGER,
      detail       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backup_runs ON backup_runs(started_at DESC);

    /* Reminders that have been sent, so nobody is emailed twice about the same
       appointment even if the job runs more than once. */
    CREATE TABLE IF NOT EXISTS reminders_sent (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      channel         TEXT NOT NULL,
      sent_at         TEXT NOT NULL,
      status          TEXT NOT NULL,
      detail          TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_once
      ON reminders_sent(appointment_id, channel);
  `);

  db.exec(`
    /* ─── A practice with staff, not a single practitioner ─────────────── */

    /* Days a member of staff is unavailable, so Today can say why the diary
       looks thin and nobody books into an absence. */
    CREATE TABLE IF NOT EXISTS absences (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_on   TEXT NOT NULL,
      ends_on     TEXT NOT NULL,
      reason      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_absences_range ON absences(starts_on, ends_on);

    /* The one master to-do list. Everything the automations generate lands
       here, which is what stops work living in half a dozen places. */
    CREATE TABLE IF NOT EXISTS tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      detail        TEXT,
      due_on        TEXT,
      priority      TEXT NOT NULL DEFAULT 'normal',
      status        TEXT NOT NULL DEFAULT 'open',
      assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      enquiry_id    INTEGER,
      /* Set when a task was generated by a workflow rather than typed by a
         person, so automated chores can be told apart from real decisions. */
      source        TEXT NOT NULL DEFAULT 'manual',
      repeat_every  TEXT,
      completed_at  TEXT,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(status, due_on);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);

    /* People who have got in touch but are not yet clients. Kept separate from
       clients so the pipeline is explicit and a dead enquiry never becomes a
       half-finished client record. Contact details are needed to reply; the
       reason for contact is health data and is encrypted. */
    CREATE TABLE IF NOT EXISTS enquiries (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      email             TEXT,
      phone             TEXT,
      stage             TEXT NOT NULL DEFAULT 'new',
      referral_source   TEXT,
      about_enc         TEXT,
      assigned_to       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_id         INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      waitlisted_at     TEXT,
      closed_reason     TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_enquiries_stage ON enquiries(stage, created_at DESC);

    /* An append-only history per client: enquiry, consultation, assessment,
       therapy, review, discharge. Free-text detail is encrypted because a
       timeline entry can be as revealing as a treatment note. */
    CREATE TABLE IF NOT EXISTS client_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      detail_enc  TEXT,
      occurred_at TEXT NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_client ON client_events(client_id, occurred_at DESC);

    /* Tags are a controlled list rather than free text, and each carries a
       sensitivity flag. A diagnosis tag is health data; "online" is not, and
       treating them identically would either over- or under-protect one. */
    CREATE TABLE IF NOT EXISTS tags (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      label        TEXT NOT NULL UNIQUE,
      category     TEXT NOT NULL DEFAULT 'general',
      is_sensitive INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS client_tags (
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (client_id, tag_id)
    );

    /* Single-use invitations, so a second member of staff can be added without
       the setup page having to stay open to the world. */
    CREATE TABLE IF NOT EXISTS invitations (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'therapist',
      invited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expires_at  TEXT NOT NULL,
      accepted_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  addColumnIfMissing(db, "appointments", "series_id", "TEXT");

  // Staff
  addColumnIfMissing(db, "users", "role", "TEXT NOT NULL DEFAULT 'owner'");
  addColumnIfMissing(db, "users", "photo_path", "TEXT");
  addColumnIfMissing(db, "users", "job_title", "TEXT");
  addColumnIfMissing(db, "users", "is_active", "INTEGER NOT NULL DEFAULT 1");

  // Client lifecycle
  addColumnIfMissing(db, "clients", "status", "TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing(db, "clients", "therapist_id", "INTEGER REFERENCES users(id)");
  addColumnIfMissing(db, "clients", "referral_source", "TEXT");
  addColumnIfMissing(db, "clients", "emergency_contact_enc", "TEXT");
  addColumnIfMissing(db, "clients", "discharged_at", "TEXT");

  seedTags(db);
  addColumnIfMissing(db, "clients", "reminders_opted_out", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "sessions", "last_active_at", "TEXT");

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_appointments_series ON appointments(series_id);`,
  );
}

/**
 * Adds a column to an existing table if it isn't already there.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and these migrations run on every
 * boot against databases that may already hold real client records — so each
 * one has to be safe to repeat.
 */
/**
 * A starting set of tags, marked for sensitivity.
 *
 * Diagnosis-shaped tags are health data under UK GDPR; "online" and "adult"
 * are not. Splitting them means access to the revealing ones can be restricted
 * without hiding the logistics everyone needs to see. Added only if the table
 * is empty, so the practice's own edits are never overwritten.
 */
function seedTags(db: Database.Database) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM tags").get() as {
    n: number;
  };
  if (n > 0) return;

  const insert = db.prepare(
    "INSERT INTO tags (label, category, is_sensitive) VALUES (?, ?, ?)",
  );
  const seed = db.transaction(() => {
    for (const [label, category, sensitive] of [
      ["ADHD", "presentation", 1],
      ["Autism", "presentation", 1],
      ["AuDHD", "presentation", 1],
      ["Depression", "presentation", 1],
      ["Anxiety", "presentation", 1],
      ["Adult", "age group", 0],
      ["Adolescent", "age group", 0],
      ["Child", "age group", 0],
      ["Online", "delivery", 0],
      ["In person", "delivery", 0],
    ] as const) {
      insert.run(label, category, sensitive);
    }
  });
  seed();
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
