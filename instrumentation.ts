import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Runs once when the Next.js server starts.
 *
 * The runtime check matters: this file is also evaluated for the edge runtime,
 * where node-cron and the SQLite driver do not exist. Importing them
 * unconditionally would break the build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Logs and carries on rather than exiting. Gating the deploy is the health
  // endpoint's job (/api/health), which answers 503 with the same reasons —
  // killing the process here instead would risk a restart loop on a host that
  // retries, and the log would scroll past before anyone read it.
  checkConfiguration();

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}

/**
 * Prints a plain-English explanation of a misconfigured deploy.
 *
 * Without this the first sign of trouble is an error the moment she saves a
 * client record. This puts the cause in the deploy log instead.
 *
 * Deliberately uses only `node:fs` and `node:path` — no dynamic imports and no
 * database driver. A startup check that can itself hang is worse than none,
 * because it turns a clear misconfiguration into a silent stall.
 */
function checkConfiguration(): boolean {
  const problems: string[] = [];
  const dbPath = process.env.DATABASE_PATH ?? "./data/practice.db";

  // Can we actually create and write where the database will live? This is what
  // catches a missing volume or a read-only mount.
  try {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const probe = join(dir, ".write-probe");
    writeFileSync(probe, "ok");
    unlinkSync(probe);
  } catch (error) {
    problems.push(
      `Cannot write to the database location "${dbPath}" — ` +
        `${error instanceof Error ? error.message : String(error)}\n` +
        `    Point DATABASE_PATH at a writable directory on a persistent disk.\n` +
        `    On Railway that means attaching a volume and putting DATABASE_PATH inside it,\n` +
        `    e.g. a volume mounted at /data with DATABASE_PATH=/data/practice.db`,
    );
  }

  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key) {
    problems.push(
      "DATA_ENCRYPTION_KEY is not set. Client health records cannot be stored without it.\n" +
        '    Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"\n' +
        "    Set it as a secret on the host — and keep a copy somewhere safe, because\n" +
        "    losing it makes every existing treatment note permanently unreadable.",
    );
  } else if (Buffer.from(key, "base64").length !== 32) {
    problems.push(
      `DATA_ENCRYPTION_KEY decodes to ${Buffer.from(key, "base64").length} bytes, but must be exactly 32.\n` +
        "    It should be 32 random bytes, base64 encoded.",
    );
  }

  if (problems.length === 0) return true;

  const rule = "─".repeat(70);
  console.error(
    `\n${rule}\n` +
      "  This deployment is not configured correctly and cannot start.\n" +
      `${rule}\n\n` +
      problems.map((p) => `  • ${p}`).join("\n\n") +
      "\n\n  See the \"Putting it online\" section of README.md.\n" +
      `${rule}\n`,
  );

  return false;
}
