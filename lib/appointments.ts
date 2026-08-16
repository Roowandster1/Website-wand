import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { addMinutes, nowSql } from "./dates";
import { getDb } from "./db";
import "server-only";

export type Appointment = {
  id: number;
  clientId: number;
  clientName: string;
  treatment: string;
  startsAt: string;
  durationMins: number;
  status: "booked" | "attended" | "cancelled" | "no-show";
  pricePence: number;
  notes: string;
  paidPence: number;
  seriesId: string | null;
};

type AppointmentRow = {
  id: number;
  client_id: number;
  client_name: string;
  treatment: string;
  starts_at: string;
  duration_mins: number;
  status: Appointment["status"];
  price_pence: number;
  notes_enc: string | null;
  paid_pence: number | null;
  series_id: string | null;
};

const SELECT = `
  SELECT a.id, a.client_id, a.treatment, a.starts_at, a.duration_mins,
         a.status, a.price_pence, a.notes_enc, a.series_id,
         (c.first_name || ' ' || c.last_name) AS client_name,
         (SELECT COALESCE(SUM(p.amount_pence), 0) FROM payments p
           WHERE p.appointment_id = a.id) AS paid_pence
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
`;

function hydrate(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    treatment: row.treatment,
    startsAt: row.starts_at,
    durationMins: row.duration_mins,
    status: row.status,
    pricePence: row.price_pence,
    notes: decrypt(row.notes_enc),
    paidPence: row.paid_pence ?? 0,
    seriesId: row.series_id,
  };
}

/** Appointments within a half-open range [from, to), ordered by start time. */
export function listAppointmentsBetween(from: string, to: string): Appointment[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at`)
    .all(from, to) as AppointmentRow[];
  return rows.map(hydrate);
}

export function listAppointmentsForClient(clientId: number): Appointment[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE a.client_id = ? ORDER BY a.starts_at DESC`)
    .all(clientId) as AppointmentRow[];
  return rows.map(hydrate);
}

export function getAppointment(id: number): Appointment | null {
  const row = getDb().prepare(`${SELECT} WHERE a.id = ?`).get(id) as
    | AppointmentRow
    | undefined;
  return row ? hydrate(row) : null;
}

export function upcomingAppointments(limit = 10): Appointment[] {
  // `nowSql()` rather than SQLite's datetime('now'), which is UTC and would be
  // an hour out against wall-clock storage throughout British Summer Time.
  const rows = getDb()
    .prepare(
      `${SELECT} WHERE a.starts_at >= ? AND a.status = 'booked'
       ORDER BY a.starts_at LIMIT ?`,
    )
    .all(nowSql(), limit) as AppointmentRow[];
  return rows.map(hydrate);
}

export type AppointmentInput = {
  clientId: number;
  treatment: string;
  startsAt: string;
  durationMins: number;
  pricePence: number;
  status?: Appointment["status"];
  notes?: string;
};

// --- Recurring series ------------------------------------------------------

/** How often a repeat lands, in days. */
export const REPEAT_INTERVALS = {
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
} as const;

export type RepeatEvery = keyof typeof REPEAT_INTERVALS;

/**
 * Works out every date in a repeating series, starting from the first.
 *
 * "Monthly" is 28 days rather than a calendar month on purpose: a fortnightly
 * or four-weekly rhythm keeps the same weekday and the same time slot, which
 * is how a treatment room actually gets booked. A calendar month would drift
 * across weekdays and collide with everything else.
 */
export function seriesDates(
  firstStartsAt: string,
  every: RepeatEvery,
  occurrences: number,
): string[] {
  const step = REPEAT_INTERVALS[every];
  return Array.from({ length: occurrences }, (_, i) =>
    addMinutes(firstStartsAt, i * step * 24 * 60),
  );
}

export type SeriesResult = {
  seriesId: string;
  created: string[];
  skipped: Array<{ startsAt: string; clashesWith: string }>;
};

/**
 * Books a whole series in one go.
 *
 * Any occurrence that collides with something already in the diary is skipped
 * rather than silently double-booked, and reported back so she can see which
 * weeks need rearranging.
 */
export function createSeries(
  input: AppointmentInput,
  every: RepeatEvery,
  occurrences: number,
  allowClashes = false,
): SeriesResult {
  const seriesId = randomUUID();
  const created: string[] = [];
  const skipped: SeriesResult["skipped"] = [];

  const insert = getDb().transaction((dates: string[]) => {
    for (const startsAt of dates) {
      if (!allowClashes) {
        const clashes = findClashes(startsAt, input.durationMins);
        if (clashes.length > 0) {
          skipped.push({ startsAt, clashesWith: clashes[0].clientName });
          continue;
        }
      }
      createAppointment({ ...input, startsAt }, seriesId);
      created.push(startsAt);
    }
  });

  insert(seriesDates(input.startsAt, every, occurrences));
  return { seriesId, created, skipped };
}

export function seriesAppointments(seriesId: string): Appointment[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE a.series_id = ? ORDER BY a.starts_at`)
    .all(seriesId) as AppointmentRow[];
  return rows.map(hydrate);
}

/** Cancels the remaining future appointments in a series, leaving the past. */
export function cancelFutureInSeries(seriesId: string, fromStartsAt: string) {
  getDb()
    .prepare(
      `UPDATE appointments SET status = 'cancelled', updated_at = datetime('now')
       WHERE series_id = ? AND starts_at >= ? AND status = 'booked'`,
    )
    .run(seriesId, fromStartsAt);
}

export function createAppointment(
  input: AppointmentInput,
  seriesId?: string,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO appointments
         (client_id, treatment, starts_at, duration_mins, price_pence, status,
          notes_enc, series_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.clientId,
      input.treatment,
      input.startsAt,
      input.durationMins,
      input.pricePence,
      input.status ?? "booked",
      encrypt(input.notes),
      seriesId ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function updateAppointment(id: number, input: AppointmentInput) {
  getDb()
    .prepare(
      `UPDATE appointments SET
         client_id = ?, treatment = ?, starts_at = ?, duration_mins = ?,
         price_pence = ?, status = ?, notes_enc = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      input.clientId,
      input.treatment,
      input.startsAt,
      input.durationMins,
      input.pricePence,
      input.status ?? "booked",
      encrypt(input.notes),
      id,
    );
}

export function deleteAppointment(id: number) {
  getDb().prepare("DELETE FROM appointments WHERE id = ?").run(id);
}

/**
 * Anything already in the diary that overlaps the proposed slot. Cancelled
 * appointments don't count — that time is free again.
 */
export function findClashes(
  startsAt: string,
  durationMins: number,
  excludeId?: number,
): Appointment[] {
  const end = addMinutes(startsAt, durationMins);

  // Two bookings overlap when each starts before the other ends. Both sides
  // are wall-clock strings in the same format, so this is plain comparison.
  const rows = getDb()
    .prepare(
      `${SELECT}
       WHERE a.status != 'cancelled'
         AND a.id != COALESCE(?, -1)
         AND a.starts_at < ?
         AND datetime(a.starts_at, '+' || a.duration_mins || ' minutes') > ?`,
    )
    .all(excludeId ?? null, end, startsAt) as AppointmentRow[];

  return rows.map(hydrate);
}
