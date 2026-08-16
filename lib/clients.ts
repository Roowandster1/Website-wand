import { decrypt, encrypt } from "./crypto";
import { getDb } from "./db";
import "server-only";

/**
 * All client reads and writes go through here, so encryption is applied in one
 * place. No page or action touches the `*_enc` columns directly — that is what
 * stops a future change from quietly writing health data in the clear.
 */

export type ClientRow = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes_enc: string | null;
  health_conditions_enc: string | null;
  medications_enc: string | null;
  allergies_enc: string | null;
  contraindications_enc: string | null;
  gp_details_enc: string | null;
  consent_given_at: string | null;
  consent_notes: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  notes: string;
  healthConditions: string;
  medications: string;
  allergies: string;
  contraindications: string;
  gpDetails: string;
  consentGivenAt: string;
  consentNotes: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  healthConditions?: string;
  medications?: string;
  allergies?: string;
  contraindications?: string;
  gpDetails?: string;
  consentGiven?: boolean;
  consentNotes?: string;
};

function hydrate(row: ClientRow): Client {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email ?? "",
    phone: row.phone ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    address: row.address ?? "",
    notes: decrypt(row.notes_enc),
    healthConditions: decrypt(row.health_conditions_enc),
    medications: decrypt(row.medications_enc),
    allergies: decrypt(row.allergies_enc),
    contraindications: decrypt(row.contraindications_enc),
    gpDetails: decrypt(row.gp_details_enc),
    consentGivenAt: row.consent_given_at ?? "",
    consentNotes: row.consent_notes ?? "",
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Summary for the list view — deliberately avoids decrypting clinical fields. */
export type ClientSummary = {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  isArchived: boolean;
  lastSeen: string | null;
  hasCautions: boolean;
};

export function listClients(search = "", includeArchived = false): ClientSummary[] {
  const term = `%${search.trim().toLowerCase()}%`;
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.is_archived,
              c.allergies_enc, c.contraindications_enc,
              (SELECT MAX(a.starts_at) FROM appointments a
                WHERE a.client_id = c.id AND a.status != 'cancelled') AS last_seen
       FROM clients c
       WHERE (? OR c.is_archived = 0)
         AND (? = '%%' OR lower(c.first_name || ' ' || c.last_name) LIKE ?
              OR lower(COALESCE(c.email, '')) LIKE ?
              OR REPLACE(COALESCE(c.phone, ''), ' ', '') LIKE ?)
       ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    )
    .all(
      includeArchived ? 1 : 0,
      term,
      term,
      term,
      `%${search.trim().replace(/\s/g, "")}%`,
    ) as Array<
    Pick<
      ClientRow,
      | "id"
      | "first_name"
      | "last_name"
      | "email"
      | "phone"
      | "is_archived"
      | "allergies_enc"
      | "contraindications_enc"
    > & { last_seen: string | null }
  >;

  return rows.map((row) => ({
    id: row.id,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email ?? "",
    phone: row.phone ?? "",
    isArchived: row.is_archived === 1,
    lastSeen: row.last_seen,
    // Flags the record without revealing what the caution is — the list view
    // has no business decrypting it.
    hasCautions: Boolean(row.allergies_enc || row.contraindications_enc),
  }));
}

export function getClient(id: number): Client | null {
  const row = getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as
    | ClientRow
    | undefined;
  return row ? hydrate(row) : null;
}

export function createClient(input: ClientInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO clients (
         first_name, last_name, email, phone, date_of_birth, address,
         notes_enc, health_conditions_enc, medications_enc, allergies_enc,
         contraindications_enc, gp_details_enc, consent_given_at, consent_notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.firstName,
      input.lastName,
      input.email || null,
      input.phone || null,
      input.dateOfBirth || null,
      input.address || null,
      encrypt(input.notes),
      encrypt(input.healthConditions),
      encrypt(input.medications),
      encrypt(input.allergies),
      encrypt(input.contraindications),
      encrypt(input.gpDetails),
      input.consentGiven ? new Date().toISOString() : null,
      input.consentNotes || null,
    );
  return Number(result.lastInsertRowid);
}

export function updateClient(id: number, input: ClientInput) {
  const existing = getDb()
    .prepare("SELECT consent_given_at FROM clients WHERE id = ?")
    .get(id) as { consent_given_at: string | null } | undefined;

  getDb()
    .prepare(
      `UPDATE clients SET
         first_name = ?, last_name = ?, email = ?, phone = ?, date_of_birth = ?,
         address = ?, notes_enc = ?, health_conditions_enc = ?,
         medications_enc = ?, allergies_enc = ?, contraindications_enc = ?,
         gp_details_enc = ?, consent_given_at = ?, consent_notes = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      input.firstName,
      input.lastName,
      input.email || null,
      input.phone || null,
      input.dateOfBirth || null,
      input.address || null,
      encrypt(input.notes),
      encrypt(input.healthConditions),
      encrypt(input.medications),
      encrypt(input.allergies),
      encrypt(input.contraindications),
      encrypt(input.gpDetails),
      // Keep the original consent date once given — overwriting it would
      // destroy the evidence of when consent was actually obtained.
      input.consentGiven
        ? (existing?.consent_given_at ?? new Date().toISOString())
        : null,
      input.consentNotes || null,
      id,
    );
}

/** Archiving is the safe default: records must usually be retained for years. */
export function archiveClient(id: number, archived: boolean) {
  getDb()
    .prepare(
      "UPDATE clients SET is_archived = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(archived ? 1 : 0, id);
}

/** Irreversible. For honouring an erasure request once retention allows it. */
export function deleteClient(id: number) {
  getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
}

// --- Treatment notes -------------------------------------------------------

export type TreatmentNote = {
  id: number;
  clientId: number;
  appointmentId: number | null;
  recordedAt: string;
  body: string;
};

export function listNotes(clientId: number): TreatmentNote[] {
  const rows = getDb()
    .prepare(
      `SELECT id, client_id, appointment_id, recorded_at, body_enc
       FROM treatment_notes WHERE client_id = ?
       ORDER BY recorded_at DESC, id DESC`,
    )
    .all(clientId) as Array<{
    id: number;
    client_id: number;
    appointment_id: number | null;
    recorded_at: string;
    body_enc: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    appointmentId: row.appointment_id,
    recordedAt: row.recorded_at,
    body: decrypt(row.body_enc),
  }));
}

export function createNote(
  clientId: number,
  body: string,
  recordedAt?: string,
  appointmentId?: number | null,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO treatment_notes (client_id, appointment_id, recorded_at, body_enc)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      clientId,
      appointmentId ?? null,
      recordedAt || new Date().toISOString(),
      encrypt(body),
    );
  return Number(result.lastInsertRowid);
}

export function deleteNote(id: number) {
  getDb().prepare("DELETE FROM treatment_notes WHERE id = ?").run(id);
}
