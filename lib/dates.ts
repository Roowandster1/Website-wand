/**
 * Dates and times, kept deliberately simple.
 *
 * Appointment times are stored as plain wall-clock strings in the practice's
 * own timezone — "2026-08-16 14:00:00" means two o'clock in the afternoon in
 * her treatment room, full stop. No UTC conversion happens anywhere.
 *
 * That is the right call for a single-location diary: two o'clock stays two
 * o'clock across the March and October clock changes, which is not true if you
 * store UTC and convert for display. The format matches SQLite's own datetime
 * format, so comparisons and strftime() in queries work directly.
 *
 * The one thing this requires: "now" must also be London wall-clock, never
 * SQLite's datetime('now'), which is UTC and would be an hour out all summer.
 */

export const PRACTICE_TIMEZONE = "Europe/London";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PRACTICE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Current London wall-clock time as "YYYY-MM-DD HH:MM:SS". */
export function nowSql(): string {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  // en-GB gives "24" for midnight in some engines; normalise to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

/** Today's date in the practice timezone, as "YYYY-MM-DD". */
export function todaySql(): string {
  return nowSql().slice(0, 10);
}

/** Shifts a "YYYY-MM-DD" date by whole days without touching timezones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the week containing the given date. */
export function startOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(isoDate, -weekday);
}

/** Converts a `datetime-local` field value to storage format. */
export function inputToSql(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]} ${match[2]}:${match[3] ?? "00"}`;
}

/** Converts storage format back into a `datetime-local` field value. */
export function sqlToInput(value: string): string {
  return value.slice(0, 16).replace(" ", "T");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

function parts(sql: string) {
  const [datePart, timePart = "00:00:00"] = sql.split(/[ T]/);
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return { y, m, d, hh, mm };
}

/** "Sunday 16 August 2026" — parsed as written, with no timezone maths. */
export function formatDate(sql: string, withWeekday = true): string {
  const { y, m, d } = parts(sql);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const body = `${d} ${MONTHS[m - 1]} ${y}`;
  return withWeekday ? `${weekday} ${body}` : body;
}

/** "16 Aug" — for compact table columns. */
export function formatDateShort(sql: string): string {
  const { y, m, d } = parts(sql);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** "2:00pm" */
export function formatTime(sql: string): string {
  const { hh, mm } = parts(sql);
  const suffix = hh < 12 ? "am" : "pm";
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour}:${String(mm).padStart(2, "0")}${suffix}`;
}

export function formatDateTime(sql: string): string {
  return `${formatDate(sql)} at ${formatTime(sql)}`;
}

/** Adds minutes to a stored datetime, staying in wall-clock terms. */
export function addMinutes(sql: string, minutes: number): string {
  const { y, m, d, hh, mm } = parts(sql);
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}:00`;
}

/** Age in whole years, for the client record. */
export function ageFrom(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const today = todaySql();
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}
