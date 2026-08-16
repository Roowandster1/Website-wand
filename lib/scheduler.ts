import cron from "node-cron";
import { runNightlyBackup } from "./auto-backup";
import { PRACTICE_TIMEZONE } from "./dates";
import { sendTomorrowsReminders } from "./reminders";
import "server-only";

/**
 * Background jobs, registered once when the server boots.
 *
 * In-process cron rather than an external scheduler because this is a single
 * long-running container for a single practice — bringing in a queue, a worker
 * and a broker to send four emails a day would be building infrastructure for
 * its own sake.
 *
 * The trade-off is honest: if the app is scaled to more than one instance,
 * these jobs run once per instance. For that, move to an external scheduler
 * hitting a protected endpoint. At this size it will not happen.
 */

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  if (process.env.DISABLE_SCHEDULER === "1") {
    console.log("[scheduler] disabled by DISABLE_SCHEDULER");
    return;
  }

  const backupAt = process.env.BACKUP_CRON ?? "30 2 * * *";
  const remindAt = process.env.REMINDER_CRON ?? "0 18 * * *";

  // 2:30am — nobody is using the system, and the day's records are complete.
  cron.schedule(
    backupAt,
    async () => {
      const result = await runNightlyBackup();
      console.log(`[backup] ${result.status}: ${result.detail}`);
    },
    { timezone: PRACTICE_TIMEZONE },
  );

  // 6pm — late enough that tomorrow's diary is settled, early enough that a
  // client who needs to rearrange can still ring.
  cron.schedule(
    remindAt,
    async () => {
      const result = await sendTomorrowsReminders();
      console.log(
        `[reminders] considered ${result.considered}, sent ${result.sent}, ` +
          `skipped ${result.skipped}, failed ${result.failed}`,
      );
    },
    { timezone: PRACTICE_TIMEZONE },
  );

  console.log(
    `[scheduler] backup "${backupAt}", reminders "${remindAt}" (${PRACTICE_TIMEZONE})`,
  );
}
