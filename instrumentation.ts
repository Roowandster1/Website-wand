/**
 * Runs once when the Next.js server starts.
 *
 * Nothing is imported at the top of this file on purpose. Instrumentation is
 * compiled for the Edge runtime as well as Node, and a static `node:fs` or
 * SQLite import here would be bundled into a runtime that has neither. Every
 * dependency is loaded inside the Node-only branch below.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Logs and carries on rather than exiting. Gating the deploy is the health
  // endpoint's job (/api/health/), which reports the same problems as a 503 —
  // killing the process here instead would risk a restart loop on a host that
  // retries, and the log would scroll past before anyone read it.
  const { checkConfiguration } = await import("./lib/startup-check");
  checkConfiguration();

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
