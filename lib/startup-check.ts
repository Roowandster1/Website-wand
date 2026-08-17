import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import "server-only";

/**
 * Prints a plain-English explanation of a misconfigured deploy.
 *
 * Lives in its own module so `instrumentation.ts` has no top-level `node:*`
 * imports. Instrumentation is compiled for the Edge runtime as well as Node, and
 * a static import of `node:fs` there is bundled into a runtime that has no such
 * module — a warning today and a plausible build failure tomorrow.
 *
 * Deliberately uses only `node:fs` and `node:path` — no database driver and no
 * further imports. A startup check that can itself hang is worse than none,
 * because it turns a clear misconfiguration into a silent stall.
 */
export function checkConfiguration(): boolean {
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
      '\n\n  See the "Putting it online" section of README.md.\n' +
      `${rule}\n`,
  );

  return false;
}
