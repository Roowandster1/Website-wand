import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getDb } from "./db";
import "server-only";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const SESSION_COOKIE = "practice_session";

/** ~100ms per hash on typical hardware — slow enough to make guessing painful. */
const SCRYPT_PARAMS = { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 2 ** 16 * 8 * 2 };
const SESSION_HOURS = 12;

/**
 * How long a session survives without activity.
 *
 * The realistic threat to a practice like this isn't a remote attacker, it's a
 * laptop left open in a treatment room between clients. Enforced here on the
 * server — the countdown in the browser is a courtesy, not the control.
 */
export const IDLE_MINUTES = Number(process.env.IDLE_TIMEOUT_MINUTES ?? 20);
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ATTEMPT_WINDOW_MINUTES = 15;

export type User = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  recovery_codes: string | null;
  failed_attempts: number;
  locked_until: string | null;
  /* Added when the practice grew from one practitioner to a team. Nullable
     because databases created before that migration will not have them set. */
  role: string | null;
  job_title: string | null;
  photo_path: string | null;
  is_active: number | null;
};

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(
    password,
    Buffer.from(saltB64, "base64"),
    expected.length,
    SCRYPT_PARAMS,
  );
  return timingSafeEqual(expected, actual);
}

/**
 * Rejects the passwords that actually get people breached. Length does more
 * work than symbol soup, so the bar is 12 characters rather than a thicket of
 * character-class rules that push people towards "Passw0rd!".
 */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < 12) {
    return "Please use at least 12 characters. A short phrase you'll remember works well.";
  }
  if (password.length > 200) {
    return "That password is too long.";
  }
  const weak = [
    "password", "12345678", "qwerty", "letmein", "welcome",
    "admin", "massage", "changeme", "iloveyou",
  ];
  const lower = password.toLowerCase();
  if (weak.some((w) => lower.includes(w))) {
    return "That contains a very commonly guessed word. Please choose something else.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting and lockout
// ---------------------------------------------------------------------------

export function recordLoginAttempt(identifier: string) {
  const db = getDb();
  db.prepare("INSERT INTO login_attempts (identifier) VALUES (?)").run(identifier);
  db.prepare(
    `DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')`,
  ).run();
}

export function isRateLimited(identifier: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE identifier = ? AND created_at > datetime('now', ?)`,
    )
    .get(identifier, `-${ATTEMPT_WINDOW_MINUTES} minutes`) as { n: number };
  return row.n >= MAX_ATTEMPTS;
}

export function clearLoginAttempts(identifier: string) {
  getDb().prepare("DELETE FROM login_attempts WHERE identifier = ?").run(identifier);
}

export function registerFailure(userId: number) {
  const db = getDb();
  db.prepare(
    `UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?`,
  ).run(userId);

  const row = db
    .prepare("SELECT failed_attempts FROM users WHERE id = ?")
    .get(userId) as { failed_attempts: number } | undefined;

  if (row && row.failed_attempts >= MAX_ATTEMPTS) {
    db.prepare(
      `UPDATE users SET locked_until = datetime('now', ?) WHERE id = ?`,
    ).run(`+${LOCKOUT_MINUTES} minutes`, userId);
  }
}

export function isLocked(user: User): boolean {
  if (!user.locked_until) return false;
  const row = getDb()
    .prepare(`SELECT datetime('now') < ? AS locked`)
    .get(user.locked_until) as { locked: number };
  return row.locked === 1;
}

export function clearFailures(userId: number) {
  getDb()
    .prepare(
      `UPDATE users
       SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now')
       WHERE id = ?`,
    )
    .run(userId);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: number): Promise<string> {
  const db = getDb();
  // 256 bits of entropy — not guessable, and not derived from anything.
  const id = randomBytes(32).toString("base64url");

  const headerList = await headers();
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, last_active_at, user_agent, ip)
     VALUES (?, ?, datetime('now', ?), datetime('now'), ?, ?)`,
  ).run(
    id,
    userId,
    `+${SESSION_HOURS} hours`,
    headerList.get("user-agent")?.slice(0, 300) ?? null,
    clientIp(headerList),
  );

  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, id, {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot steal it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });

  return id;
}

/**
 * The current signed-in user, or null. Wrapped in React's `cache` so several
 * components on one page share a single database read.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, s.last_active_at FROM users u
       JOIN sessions s ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .get(sessionId) as (User & { last_active_at: string | null }) | undefined;

  if (!row) return null;

  // Idle expiry. Checked on read rather than by a timer, so a session that has
  // been sitting untouched is already dead by the time anyone looks at it.
  if (row.last_active_at) {
    const stale = db
      .prepare(`SELECT datetime(?, ?) < datetime('now') AS expired`)
      .get(row.last_active_at, `+${IDLE_MINUTES} minutes`) as {
      expired: number;
    };
    if (stale.expired === 1) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      return null;
    }
  }

  db.prepare(
    "UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?",
  ).run(sessionId);

  return row;
});

/** Seconds of inactivity left before this session dies. */
export async function idleSecondsRemaining(): Promise<number> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return 0;

  const row = getDb()
    .prepare(
      `SELECT CAST(
         (julianday(datetime(last_active_at, ?)) - julianday('now')) * 86400 AS INTEGER
       ) AS remaining FROM sessions WHERE id = ?`,
    )
    .get(`+${IDLE_MINUTES} minutes`, sessionId) as
    | { remaining: number | null }
    | undefined;

  return Math.max(0, row?.remaining ?? 0);
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Signs every other device out — used after a password change. */
export function destroyAllSessions(userId: number) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

// ---------------------------------------------------------------------------
// Half-finished logins (password accepted, waiting on the 2FA code)
// ---------------------------------------------------------------------------

const PENDING_MINUTES = 5;

/** Mints a single-use token proving the password step succeeded. */
export function createPendingLogin(userId: number): string {
  const db = getDb();
  const id = randomBytes(32).toString("base64url");

  db.prepare(
    `INSERT INTO pending_logins (id, user_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`,
  ).run(id, userId, `+${PENDING_MINUTES} minutes`);

  db.prepare(`DELETE FROM pending_logins WHERE expires_at < datetime('now')`).run();
  return id;
}

/**
 * Consumes a pending-login token, returning the user it belongs to.
 *
 * Deleted on lookup whether or not the code that follows is correct, so a
 * token is worth exactly one attempt and cannot be ground against.
 */
export function consumePendingLogin(token: string): User | null {
  if (!token) return null;
  const db = getDb();

  const row = db
    .prepare(
      `SELECT u.* FROM users u
       JOIN pending_logins p ON p.user_id = u.id
       WHERE p.id = ? AND p.expires_at > datetime('now')`,
    )
    .get(token) as User | undefined;

  db.prepare("DELETE FROM pending_logins WHERE id = ?").run(token);
  return row ?? null;
}

export function userCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  return row.n;
}

export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return headerList.get("x-real-ip")?.slice(0, 64) ?? null;
}
