import { NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb } from "@/lib/db";

/**
 * Readiness check, for Railway and any other host that polls before switching
 * traffic over.
 *
 * It deliberately fails when the app is misconfigured rather than reporting
 * healthy and breaking the first time she saves a client record. Nothing
 * sensitive is returned — no counts, no paths, no key material.
 *
 * Imports are static, not dynamic: a dynamic `await import()` of a module that
 * fails can leave the request hanging with nothing logged, which on a host that
 * polls this endpoint means an unexplained healthcheck timeout — the exact
 * failure this endpoint exists to prevent.
 */
export const dynamic = "force-dynamic";

/** Never let a wedged check hold the response open. */
function withTimeout<T>(label: string, ms: number, work: () => T): Promise<T> {
  return Promise.race([
    (async () => work())(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function GET() {
  const problems: string[] = [];

  // 1. Can we open and write to the database? Catches a missing or read-only
  //    volume, which is the classic first-deploy failure.
  try {
    await withTimeout("database check", 5000, () => {
      const db = getDb();
      db.prepare("SELECT 1").get();
      // A write, not just a read — the filesystem may be mounted read-only.
      db.prepare(
        `INSERT INTO backup_runs (started_at, status, detail)
         VALUES (datetime('now'), 'healthcheck', 'readiness probe')`,
      ).run();
      db.prepare(`DELETE FROM backup_runs WHERE status = 'healthcheck'`).run();
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[health] database check failed:", detail);
    problems.push(`database not writable: ${detail}`);
  }

  // 2. Is the encryption key present and the right shape? Without it, saving a
  //    treatment note would throw at runtime.
  try {
    await withTimeout("encryption check", 5000, () => {
      if (decrypt(encrypt("readiness")) !== "readiness") {
        throw new Error("round-trip mismatch");
      }
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error("[health] encryption check failed:", detail);
    problems.push(`DATA_ENCRYPTION_KEY: ${detail}`);
  }

  if (problems.length > 0) {
    return NextResponse.json(
      { status: "not ready", problems },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
