import { addDays, todaySql } from "./dates";
import { getDb } from "./db";
import "server-only";

/**
 * Practice analytics — answering the questions a solo therapist actually has:
 * what earns most, who has drifted away, which hours never fill, and how much
 * money is walking out of the door as no-shows.
 *
 * All of it comes from data already in the database. Nothing here touches the
 * encrypted clinical fields; you can measure a practice without reading
 * anybody's medical history.
 */

export type TreatmentPerformance = {
  treatment: string;
  bookings: number;
  attended: number;
  revenuePence: number;
  averagePence: number;
};

export function treatmentPerformance(sinceDate: string): TreatmentPerformance[] {
  return getDb()
    .prepare(
      `SELECT a.treatment,
              COUNT(*) AS bookings,
              SUM(CASE WHEN a.status = 'attended' THEN 1 ELSE 0 END) AS attended,
              COALESCE(SUM(CASE WHEN a.status = 'attended' THEN a.price_pence ELSE 0 END), 0) AS revenuePence,
              CAST(COALESCE(AVG(CASE WHEN a.status = 'attended' THEN a.price_pence END), 0) AS INTEGER) AS averagePence
       FROM appointments a
       WHERE a.starts_at >= ?
       GROUP BY a.treatment
       ORDER BY revenuePence DESC`,
    )
    .all(sinceDate) as TreatmentPerformance[];
}

export type AttendanceSummary = {
  total: number;
  attended: number;
  cancelled: number;
  noShow: number;
  booked: number;
  lostPence: number;
};

/** How often appointments are kept — and what the ones that aren't cost. */
export function attendanceSummary(sinceDate: string): AttendanceSummary {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'attended' THEN 1 ELSE 0 END) AS attended,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) AS noShow,
              SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS booked,
              COALESCE(SUM(CASE WHEN status = 'no-show' THEN price_pence ELSE 0 END), 0) AS lostPence
       FROM appointments WHERE starts_at >= ?`,
    )
    .get(sinceDate) as AttendanceSummary;

  return row;
}

export type HourUsage = { hour: number; count: number };

/** Which hours of the day actually fill, so dead slots can be dropped. */
export function busiestHours(sinceDate: string): HourUsage[] {
  const rows = getDb()
    .prepare(
      `SELECT CAST(strftime('%H', starts_at) AS INTEGER) AS hour, COUNT(*) AS count
       FROM appointments
       WHERE starts_at >= ? AND status != 'cancelled'
       GROUP BY hour ORDER BY hour`,
    )
    .all(sinceDate) as HourUsage[];
  return rows;
}

export type WeekdayUsage = { weekday: string; count: number };

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function busiestWeekdays(sinceDate: string): WeekdayUsage[] {
  const rows = getDb()
    .prepare(
      `SELECT CAST(strftime('%w', starts_at) AS INTEGER) AS dow, COUNT(*) AS count
       FROM appointments
       WHERE starts_at >= ? AND status != 'cancelled'
       GROUP BY dow ORDER BY dow`,
    )
    .all(sinceDate) as Array<{ dow: number; count: number }>;

  return rows.map((r) => ({ weekday: WEEKDAY_NAMES[r.dow], count: r.count }));
}

export type LapsedClient = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  lastSeen: string;
  visits: number;
};

/**
 * Clients who used to come and haven't for a while.
 *
 * The most effective thing a small practice can do for its income is notice
 * these people, because they already know and trust her — but nobody notices
 * an absence without being told about it.
 */
export function lapsedClients(days = 90): LapsedClient[] {
  const cutoff = addDays(todaySql(), -days);

  return getDb()
    .prepare(
      `SELECT c.id, (c.first_name || ' ' || c.last_name) AS fullName,
              c.email, c.phone,
              MAX(a.starts_at) AS lastSeen,
              COUNT(a.id) AS visits
       FROM clients c
       JOIN appointments a ON a.client_id = c.id AND a.status = 'attended'
       WHERE c.is_archived = 0
       GROUP BY c.id
       HAVING lastSeen < ?
       ORDER BY lastSeen DESC`,
    )
    .all(cutoff) as LapsedClient[];
}

export type RetentionSummary = {
  totalClients: number;
  returning: number;
  oneVisitOnly: number;
  averageVisits: number;
};

/** How many people come back after a first visit. */
export function retentionSummary(): RetentionSummary {
  const rows = getDb()
    .prepare(
      `SELECT c.id, COUNT(a.id) AS visits
       FROM clients c
       LEFT JOIN appointments a ON a.client_id = c.id AND a.status = 'attended'
       WHERE c.is_archived = 0
       GROUP BY c.id`,
    )
    .all() as Array<{ id: number; visits: number }>;

  const seen = rows.filter((r) => r.visits > 0);
  const returning = seen.filter((r) => r.visits > 1).length;
  const totalVisits = seen.reduce((sum, r) => sum + r.visits, 0);

  return {
    totalClients: seen.length,
    returning,
    oneVisitOnly: seen.length - returning,
    averageVisits: seen.length ? totalVisits / seen.length : 0,
  };
}

export type TopClient = {
  id: number;
  fullName: string;
  visits: number;
  spentPence: number;
};

export function topClients(sinceDate: string, limit = 8): TopClient[] {
  return getDb()
    .prepare(
      `SELECT c.id, (c.first_name || ' ' || c.last_name) AS fullName,
              COUNT(DISTINCT a.id) AS visits,
              COALESCE(SUM(p.amount_pence), 0) AS spentPence
       FROM clients c
       LEFT JOIN appointments a
         ON a.client_id = c.id AND a.status = 'attended' AND a.starts_at >= ?
       LEFT JOIN payments p ON p.client_id = c.id AND p.paid_at >= ?
       WHERE c.is_archived = 0
       GROUP BY c.id
       HAVING visits > 0 OR spentPence > 0
       ORDER BY spentPence DESC, visits DESC
       LIMIT ?`,
    )
    .all(sinceDate, sinceDate, limit) as TopClient[];
}
