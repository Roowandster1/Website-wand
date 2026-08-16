/**
 * Runs once when the Next.js server starts.
 *
 * The runtime check matters: this file is also evaluated for the edge runtime,
 * where node-cron and the SQLite driver do not exist. Importing the scheduler
 * unconditionally would break the build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
