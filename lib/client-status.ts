/**
 * Constants describing where a client is up to.
 *
 * Deliberately free of any database import so form components can use them
 * without dragging better-sqlite3 into the browser bundle — the same split as
 * lib/pipeline.ts. The logic that reads and writes these lives in
 * lib/client-lifecycle.ts, which is server-only.
 */

export const CLIENT_STATUSES = [
  "waiting",
  "active",
  "paused",
  "discharged",
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const STATUS_LABELS: Record<ClientStatus, string> = {
  waiting: "On the waiting list",
  active: "Currently seeing",
  paused: "Paused",
  discharged: "Discharged",
};

/** Shown beside the choice, so the difference between them isn't guesswork. */
export const STATUS_HINTS: Record<ClientStatus, string> = {
  waiting: "Wants to start, no sessions booked yet.",
  active: "In regular sessions.",
  paused: "Taking a break and intending to come back.",
  discharged: "The work has finished.",
};

export function isClientStatus(value: string): value is ClientStatus {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}

/**
 * The kinds of thing that go on a client's timeline.
 *
 * A closed list rather than free text: a timeline is only useful if it can be
 * skimmed, and it can only be skimmed if the entries are of known kinds.
 */
export const EVENT_KINDS = [
  "enquiry",
  "consultation",
  "assessment",
  "therapy",
  "review",
  "pause",
  "discharge",
  "admin",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_LABELS: Record<EventKind, string> = {
  enquiry: "First enquiry",
  consultation: "Initial call",
  assessment: "Assessment",
  therapy: "Therapy began",
  review: "Review",
  pause: "Paused",
  discharge: "Discharged",
  admin: "Note on file",
};

export function isEventKind(value: string): value is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(value);
}
