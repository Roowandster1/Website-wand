import {
  EVENT_LABELS,
  STATUS_LABELS,
  type ClientStatus,
  type EventKind,
} from "./client-status";
import type { Client } from "./clients";
import { decrypt, encrypt } from "./crypto";
import { nowSql, todaySql } from "./dates";
import { getDb } from "./db";
import "server-only";

/**
 * Status, timeline, tags, the missing-information detector and the derived
 * "next action" — the parts of a client record that answer "where is this
 * person up to and what do I owe them?".
 *
 * Everything here reads and writes through this module so the encryption of
 * timeline detail happens in one place, the same rule lib/clients.ts follows.
 */

/* --- Status ---------------------------------------------------------------- */

export function setClientStatus(
  clientId: number,
  status: ClientStatus,
  userId: number | null,
) {
  const db = getDb();
  const change = db.transaction(() => {
    db.prepare(
      `UPDATE clients
          SET status = ?,
              discharged_at = CASE WHEN ? = 'discharged'
                                   THEN COALESCE(discharged_at, ?)
                                   ELSE NULL END,
              updated_at = ?
        WHERE id = ?`,
    ).run(status, status, todaySql(), nowSql(), clientId);

    /* The timeline should say when this happened without anybody having to
       remember to write it down. Only the kinds that map to a real milestone get
       an entry — "active" after a pause is a resumption, not a new beginning, so
       it lands as an admin note rather than pretending therapy just started. */
    const kind: EventKind =
      status === "discharged" ? "discharge" : status === "paused" ? "pause" : "admin";

    addClientEvent(
      {
        clientId,
        kind,
        detail: `Status set to ${STATUS_LABELS[status].toLowerCase()}.`,
        occurredAt: todaySql(),
      },
      userId,
    );
  });
  change();
}

/**
 * One click to finish the work.
 *
 * Discharging is not the same as archiving, and conflating them is how records
 * get hidden before they should be. This closes the therapy and puts a summary
 * on the timeline; the record stays in the active list until it is archived
 * separately, which is a decision about retention rather than about treatment.
 */
export function dischargeClient(
  clientId: number,
  summary: string,
  userId: number | null,
) {
  const db = getDb();
  const finish = db.transaction(() => {
    db.prepare(
      `UPDATE clients
          SET status = 'discharged',
              discharged_at = COALESCE(discharged_at, ?),
              updated_at = ?
        WHERE id = ?`,
    ).run(todaySql(), nowSql(), clientId);

    addClientEvent(
      {
        clientId,
        kind: "discharge",
        detail: summary.trim() || "Work completed.",
        occurredAt: todaySql(),
      },
      userId,
    );
  });
  finish();
}

export function setReferralSource(clientId: number, source: string) {
  getDb()
    .prepare("UPDATE clients SET referral_source = ?, updated_at = ? WHERE id = ?")
    .run(source.trim() || null, nowSql(), clientId);
}

/* --- Timeline -------------------------------------------------------------- */

export type ClientEvent = {
  id: number;
  kind: EventKind;
  label: string;
  detail: string;
  occurredAt: string;
  createdBy: string | null;
  createdAt: string;
};

export type ClientEventInput = {
  clientId: number;
  kind: EventKind;
  detail: string;
  occurredAt: string;
};

/** Encrypted, because a line of timeline detail can be as revealing as a note. */
export function addClientEvent(
  input: ClientEventInput,
  userId: number | null,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO client_events (client_id, kind, detail_enc, occurred_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.clientId,
      input.kind,
      input.detail.trim() ? encrypt(input.detail.trim()) : null,
      input.occurredAt,
      userId,
    );
  return Number(result.lastInsertRowid);
}

export function listClientEvents(clientId: number): ClientEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.kind, e.detail_enc, e.occurred_at, e.created_at, u.name AS created_by
         FROM client_events e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.client_id = ?
        ORDER BY e.occurred_at DESC, e.id DESC`,
    )
    .all(clientId) as Array<{
    id: number;
    kind: string;
    detail_enc: string | null;
    occurred_at: string;
    created_at: string;
    created_by: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as EventKind,
    label: EVENT_LABELS[row.kind as EventKind] ?? row.kind,
    detail: decrypt(row.detail_enc),
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export function deleteClientEvent(id: number) {
  getDb().prepare("DELETE FROM client_events WHERE id = ?").run(id);
}

/* --- Tags ------------------------------------------------------------------ */

export type Tag = {
  id: number;
  label: string;
  category: string;
  isSensitive: boolean;
};

export function listTags(): Tag[] {
  const rows = getDb()
    .prepare(
      `SELECT id, label, category, is_sensitive
         FROM tags
        ORDER BY is_sensitive, category, label COLLATE NOCASE`,
    )
    .all() as Array<{
    id: number;
    label: string;
    category: string;
    is_sensitive: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    isSensitive: row.is_sensitive === 1,
  }));
}

export function clientTags(clientId: number): Tag[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.label, t.category, t.is_sensitive
         FROM client_tags ct
         JOIN tags t ON t.id = ct.tag_id
        WHERE ct.client_id = ?
        ORDER BY t.is_sensitive, t.label COLLATE NOCASE`,
    )
    .all(clientId) as Array<{
    id: number;
    label: string;
    category: string;
    is_sensitive: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    isSensitive: row.is_sensitive === 1,
  }));
}

export function setClientTags(clientId: number, tagIds: number[]) {
  const db = getDb();
  const replace = db.transaction(() => {
    db.prepare("DELETE FROM client_tags WHERE client_id = ?").run(clientId);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO client_tags (client_id, tag_id) VALUES (?, ?)",
    );
    for (const tagId of tagIds) insert.run(clientId, tagId);
  });
  replace();
}

/* --- Missing information --------------------------------------------------- */

export type Gap = { label: string; why: string };

/**
 * What isn't on the record yet, and why it matters.
 *
 * The "why" is the point. A list of empty fields invites box-ticking; a list
 * that says what each gap costs lets her decide which ones actually need
 * chasing. Consent is first because it is the one with legal weight.
 */
export function missingInformation(client: Client): Gap[] {
  const gaps: Gap[] = [];

  if (!client.consentGivenAt) {
    gaps.push({
      label: "Consent not recorded",
      why: "Holding health notes needs a recorded basis. This is the one gap with legal weight.",
    });
  }

  if (!client.phone && !client.email) {
    gaps.push({
      label: "No way to contact them",
      why: "Neither a phone number nor an email address — a cancellation couldn't be passed on.",
    });
  } else if (!client.phone) {
    gaps.push({
      label: "No phone number",
      why: "Reminders and last-minute changes go by phone.",
    });
  }

  if (!client.dateOfBirth) {
    gaps.push({
      label: "No date of birth",
      why: "Sets the retention period, and confirms they were an adult at the first session.",
    });
  }

  if (!client.gpDetails) {
    gaps.push({
      label: "No GP recorded",
      why: "Needed if you ever have to act on a risk to their safety.",
    });
  }

  return gaps;
}

/* --- The next action ------------------------------------------------------- */

export type NextAction = {
  label: string;
  detail: string;
  tone: "urgent" | "due" | "calm";
  href?: string;
};

/**
 * What this client needs next — worked out from the record, never stored.
 *
 * A "next action" column that somebody has to keep up to date is wrong within a
 * week: the appointment gets booked, the note gets written, and the field still
 * says otherwise. Deriving it means it is always true, and there is nothing to
 * maintain. The cost is a few queries per client, which for a single-handed
 * practice is nothing.
 *
 * Ordered by what would be worst to forget.
 */
export function nextAction(client: Client): NextAction | null {
  const db = getDb();
  const today = todaySql();

  if (client.isArchived) return null;

  if (!client.consentGivenAt) {
    return {
      label: "Record consent",
      detail: "No consent on file, and there are notes being kept.",
      tone: "urgent",
      href: `/admin/clients/${client.id}/edit`,
    };
  }

  /* A session that happened and was never written up. The one a therapist most
     regrets: the detail is gone within days. */
  const unwritten = db
    .prepare(
      `SELECT a.id, a.starts_at
         FROM appointments a
        WHERE a.client_id = ?
          AND a.status = 'attended'
          AND a.starts_at < ?
          AND NOT EXISTS (
                SELECT 1 FROM treatment_notes n WHERE n.appointment_id = a.id
              )
        ORDER BY a.starts_at DESC
        LIMIT 1`,
    )
    .get(client.id, nowSql()) as { id: number; starts_at: string } | undefined;

  if (unwritten) {
    return {
      label: "Write up the last session",
      detail: `Attended on ${unwritten.starts_at.slice(0, 10)} with no note against it.`,
      tone: "due",
      href: `/admin/clients/${client.id}`,
    };
  }

  /* Matched per appointment, exactly as lib/payments.ts listOutstanding does.
     Summing every payment against every appointment instead would disagree with
     the Payments page the moment somebody part-pays or pays in advance, and two
     screens quoting different amounts owed is worse than neither. */
  const owed = db
    .prepare(
      `SELECT COALESCE(SUM(owed), 0) AS balance FROM (
         SELECT a.price_pence - COALESCE(SUM(p.amount_pence), 0) AS owed
           FROM appointments a
           LEFT JOIN payments p ON p.appointment_id = a.id
          WHERE a.client_id = ?
            AND a.status = 'attended'
            AND a.price_pence > 0
          GROUP BY a.id
         HAVING owed > 0
       )`,
    )
    .get(client.id) as { balance: number };

  if (owed.balance > 0) {
    return {
      label: "Payment outstanding",
      detail: `£${(owed.balance / 100).toFixed(2)} owed across attended sessions.`,
      tone: "due",
      href: "/admin/payments",
    };
  }

  if (client.status === "waiting") {
    return {
      label: "Offer a slot",
      detail: "On the waiting list with nothing booked.",
      tone: "calm",
      href: `/admin/diary/new?client=${client.id}`,
    };
  }

  if (client.status === "discharged") return null;

  const future = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM appointments a
        WHERE a.client_id = ?
          AND a.status != 'cancelled'
          AND date(a.starts_at) >= ?`,
    )
    .get(client.id, today) as { n: number };

  if (future.n === 0) {
    return {
      label: "Book the next session",
      detail:
        client.status === "paused"
          ? "Paused, so this can wait — but nothing is in the diary."
          : "Currently seeing them, with nothing in the diary.",
      tone: client.status === "paused" ? "calm" : "due",
      href: `/admin/diary/new?client=${client.id}`,
    };
  }

  return null;
}

/** The status and next action for every client, for the list view. */
export type ClientLifecycle = {
  status: ClientStatus;
  referralSource: string | null;
  dischargedAt: string | null;
};

export function clientLifecycle(clientId: number): ClientLifecycle {
  const row = getDb()
    .prepare(
      "SELECT status, referral_source, discharged_at FROM clients WHERE id = ?",
    )
    .get(clientId) as
    | { status: string; referral_source: string | null; discharged_at: string | null }
    | undefined;

  return {
    status: (row?.status as ClientStatus) ?? "active",
    referralSource: row?.referral_source ?? null,
    dischargedAt: row?.discharged_at ?? null,
  };
}
