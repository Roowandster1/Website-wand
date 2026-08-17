import { NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb } from "@/lib/db";

/**
 * Liveness and diagnostics.
 *
 * This deliberately answers 200 whenever the server can serve requests at all,
 * and reports configuration problems as `warnings` rather than failing.
 *
 * It used to return 503 for a missing encryption key, on the reasoning that a
 * deploy which cannot store health records should not go live. In practice that
 * was the wrong trade: the platform shows "Healthcheck failure" and nothing
 * else, so a missing environment variable looked identical to a crashed server
 * and blocked the very deploy you need in order to investigate. A configuration
 * problem now surfaces in the admin dashboard, where the person who can fix it
 * will actually see it, and here in the JSON for anyone checking by hand.
 *
 * Visit /api/health/ on a running deployment to see exactly what is wrong.
 * Nothing sensitive is returned — no counts, no paths, no key material.
 */
export const dynamic = "force-dynamic";

function withTimeout<T>(label: string, ms: number, work: () => T): Promise<T> {
  return Promise.race([
    (async () => work())(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function GET() {
  const warnings: string[] = [];

  // Can the database be opened and written to? Catches a missing or read-only
  // volume — the thing that silently loses client records.
  let databaseOk = false;
  try {
    await withTimeout("database check", 5000, () => {
      const db = getDb();
      db.prepare("SELECT 1").get();
      db.prepare(
        `INSERT INTO backup_runs (started_at, status, detail)
         VALUES (datetime('now'), 'healthcheck', 'liveness probe')`,
      ).run();
      db.prepare(`DELETE FROM backup_runs WHERE status = 'healthcheck'`).run();
      databaseOk = true;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[health] database not writable:", detail);
    warnings.push(
      `Database is not writable (${detail}). Client records cannot be saved. ` +
        "Attach a persistent volume and point DATABASE_PATH inside it.",
    );
  }

  // Is the encryption key usable? Without it, health information cannot be
  // stored — but the public website works perfectly, so this is not fatal to
  // serving traffic.
  try {
    await withTimeout("encryption check", 5000, () => {
      if (decrypt(encrypt("liveness")) !== "liveness") {
        throw new Error("round-trip mismatch");
      }
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error("[health] encryption not usable:", detail);
    warnings.push(
      `DATA_ENCRYPTION_KEY is not usable (${detail}). Treatment notes and ` +
        "health information cannot be saved until it is set to 32 random " +
        "bytes, base64 encoded.",
    );
  }

  return NextResponse.json(
    {
      status: warnings.length === 0 ? "ok" : "degraded",
      serving: true,
      databaseWritable: databaseOk,
      warnings,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
