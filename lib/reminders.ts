import { contact, site } from "@/content/site";
import { addDays, formatDate, formatTime, todaySql } from "./dates";
import { getDb } from "./db";
import { isEmailConfigured, sendMail } from "./email";
import "server-only";

/**
 * Appointment reminders, sent the day before.
 *
 * A no-show is a whole hour of lost income for a one-person practice, and a
 * reminder the day before is the cheapest thing that reduces them.
 *
 * Two rules shape what these messages say:
 *
 *  1. **No clinical detail.** The treatment name never appears. An email
 *     preview on a lock screen, or a shared family inbox, should not disclose
 *     that someone is having therapy — let alone which kind.
 *  2. **Every send is recorded**, with a unique index on (appointment, channel),
 *     so running the job twice cannot email anyone twice.
 */

export type ReminderOutcome = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  detail: string[];
};

type Due = {
  id: number;
  starts_at: string;
  client_name: string;
  first_name: string;
  email: string | null;
  opted_out: number;
};

/** Booked appointments tomorrow whose client hasn't already been reminded. */
export function dueReminders(forDate: string): Due[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.starts_at,
              (c.first_name || ' ' || c.last_name) AS client_name,
              c.first_name, c.email,
              COALESCE(c.reminders_opted_out, 0) AS opted_out
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       WHERE a.status = 'booked'
         AND date(a.starts_at) = ?
         AND NOT EXISTS (
           SELECT 1 FROM reminders_sent r
           WHERE r.appointment_id = a.id AND r.channel = 'email'
         )
       ORDER BY a.starts_at`,
    )
    .all(forDate) as Due[];
}

function markSent(
  appointmentId: number,
  status: string,
  detail: string,
) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO reminders_sent
         (appointment_id, channel, sent_at, status, detail)
       VALUES (?, 'email', datetime('now'), ?, ?)`,
    )
    .run(appointmentId, status, detail.slice(0, 300));
}

export async function sendTomorrowsReminders(): Promise<ReminderOutcome> {
  const target = addDays(todaySql(), 1);
  const due = dueReminders(target);

  const outcome: ReminderOutcome = {
    considered: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    detail: [],
  };

  if (due.length === 0) return outcome;

  if (!isEmailConfigured()) {
    outcome.skipped = due.length;
    outcome.detail.push("SMTP is not configured, so no reminders were sent.");
    return outcome;
  }

  for (const appointment of due) {
    if (appointment.opted_out) {
      // Recorded as skipped so the job doesn't reconsider them every night.
      markSent(appointment.id, "opted-out", "Client has opted out");
      outcome.skipped++;
      continue;
    }

    if (!appointment.email) {
      markSent(appointment.id, "no-email", "No email address on file");
      outcome.skipped++;
      continue;
    }

    const result = await sendMail({
      to: appointment.email,
      subject: `Your appointment tomorrow — ${site.name}`,
      text: buildMessage(appointment),
    });

    if (result.sent) {
      markSent(appointment.id, "sent", result.detail);
      outcome.sent++;
    } else {
      // Not marked, so a transient mail failure is retried on the next run.
      outcome.failed++;
      outcome.detail.push(`${appointment.client_name}: ${result.detail}`);
    }
  }

  return outcome;
}

/**
 * The message body. Deliberately says when, and nothing about what — no session
 * type, no reason for the appointment.
 *
 * It doesn't say where either. Sessions happen in two different rooms, online
 * and by phone, and the diary doesn't record which; guessing would be worse than
 * silent, and the client already knows.
 */
function buildMessage(appointment: Due): string {
  return [
    `Hello ${appointment.first_name},`,
    "",
    `Just a reminder about your appointment tomorrow, ${formatDate(
      appointment.starts_at,
    )} at ${formatTime(appointment.starts_at)}, as arranged.`,
    "",
    `If you need to change or cancel it, please ring ${contact.phone} — as much notice as you can manage is much appreciated.`,
    "",
    "See you then,",
    site.name,
    "",
    "—",
    "If you'd rather not get these reminders, just reply and say so.",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");
}

export type ReminderLogEntry = {
  id: number;
  appointment_id: number;
  sent_at: string;
  status: string;
  detail: string | null;
  client_name: string;
  starts_at: string;
};

export function recentReminders(limit = 20): ReminderLogEntry[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.appointment_id, r.sent_at, r.status, r.detail,
              (c.first_name || ' ' || c.last_name) AS client_name, a.starts_at
       FROM reminders_sent r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN clients c ON c.id = a.client_id
       ORDER BY r.sent_at DESC, r.id DESC LIMIT ?`,
    )
    .all(limit) as ReminderLogEntry[];
}
