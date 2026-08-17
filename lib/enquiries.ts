import { decrypt, encrypt } from "./crypto";
import { getDb } from "./db";
import "server-only";

/**
 * People who have got in touch but are not yet clients.
 *
 * Kept in their own table rather than as clients with a "pending" flag. An
 * enquiry that goes nowhere is not a client, and half-finished client records
 * are exactly what makes a caseload untrustworthy — you can never tell whether
 * an empty record means "no information" or "never became a client".
 *
 * The stages are the actual journey, in order. Each one has a single obvious
 * next action, which is what the pipeline view is built around.
 */
// Re-exported so existing imports keep working; the definitions live in a
// module free of server-only so client components can use them too.
export {
  STAGES,
  OPEN_STAGES,
  STAGE_LABELS,
  STAGE_NEXT_ACTION,
  REFERRAL_SOURCES,
  type Stage,
} from "./pipeline";

import { OPEN_STAGES, type Stage } from "./pipeline";

export type Enquiry = {
  id: number;
  name: string;
  email: string;
  phone: string;
  stage: Stage;
  referralSource: string;
  /** Why they got in touch — health data, so encrypted at rest. */
  about: string;
  assignedTo: number | null;
  assignedName: string | null;
  clientId: number | null;
  closedReason: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  stage: Stage;
  referral_source: string | null;
  about_enc: string | null;
  assigned_to: number | null;
  assigned_name: string | null;
  client_id: number | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT = `
  SELECT e.*, u.name AS assigned_name
  FROM enquiries e
  LEFT JOIN users u ON u.id = e.assigned_to
`;

function hydrate(row: Row): Enquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    stage: row.stage,
    referralSource: row.referral_source ?? "",
    about: decrypt(row.about_enc),
    assignedTo: row.assigned_to,
    assignedName: row.assigned_name,
    clientId: row.client_id,
    closedReason: row.closed_reason ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Everything still in play, oldest first — the longest wait is most urgent. */
export function listOpenEnquiries(): Enquiry[] {
  const rows = getDb()
    .prepare(
      `${SELECT} WHERE e.stage NOT IN ('converted', 'closed')
       ORDER BY e.created_at`,
    )
    .all() as Row[];
  return rows.map(hydrate);
}

export function listEnquiriesByStage(stage: Stage): Enquiry[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE e.stage = ? ORDER BY e.created_at`)
    .all(stage) as Row[];
  return rows.map(hydrate);
}

export function getEnquiry(id: number): Enquiry | null {
  const row = getDb().prepare(`${SELECT} WHERE e.id = ?`).get(id) as
    | Row
    | undefined;
  return row ? hydrate(row) : null;
}

export function countNewEnquiries(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM enquiries WHERE stage = 'new'")
    .get() as { n: number };
  return row.n;
}

/** How long each open enquiry has been waiting, for spotting neglect. */
export function stageCounts(): Array<{ stage: Stage; count: number }> {
  const rows = getDb()
    .prepare(
      `SELECT stage, COUNT(*) AS count FROM enquiries
       WHERE stage NOT IN ('converted','closed') GROUP BY stage`,
    )
    .all() as Array<{ stage: Stage; count: number }>;

  // Every open stage appears, including the empty ones, so the pipeline reads
  // as a pipeline rather than only the stages that happen to be busy.
  return OPEN_STAGES.map((stage) => ({
    stage,
    count: rows.find((r) => r.stage === stage)?.count ?? 0,
  }));
}

export type EnquiryInput = {
  name: string;
  email?: string;
  phone?: string;
  referralSource?: string;
  about?: string;
  stage?: Stage;
  assignedTo?: number | null;
};

export function createEnquiry(input: EnquiryInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO enquiries
         (name, email, phone, stage, referral_source, about_enc, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.email || null,
      input.phone || null,
      input.stage ?? "new",
      input.referralSource || null,
      encrypt(input.about),
      input.assignedTo ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function updateEnquiry(id: number, input: EnquiryInput): void {
  getDb()
    .prepare(
      `UPDATE enquiries SET
         name = ?, email = ?, phone = ?, stage = ?, referral_source = ?,
         about_enc = ?, assigned_to = ?,
         waitlisted_at = CASE WHEN ? = 'waitlist' AND waitlisted_at IS NULL
                              THEN datetime('now') ELSE waitlisted_at END,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.email || null,
      input.phone || null,
      input.stage ?? "new",
      input.referralSource || null,
      encrypt(input.about),
      input.assignedTo ?? null,
      input.stage ?? "new",
      id,
    );
}

export function setStage(id: number, stage: Stage): void {
  getDb()
    .prepare(
      `UPDATE enquiries SET stage = ?, updated_at = datetime('now'),
       waitlisted_at = CASE WHEN ? = 'waitlist' AND waitlisted_at IS NULL
                            THEN datetime('now') ELSE waitlisted_at END
       WHERE id = ?`,
    )
    .run(stage, stage, id);
}

export function closeEnquiry(id: number, reason: string): void {
  getDb()
    .prepare(
      `UPDATE enquiries SET stage = 'closed', closed_reason = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(reason || null, id);
}

/** Links an enquiry to the client record it became, and marks it converted. */
export function markConverted(id: number, clientId: number): void {
  getDb()
    .prepare(
      `UPDATE enquiries SET stage = 'converted', client_id = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(clientId, id);
}

export function deleteEnquiry(id: number): void {
  getDb().prepare("DELETE FROM enquiries WHERE id = ?").run(id);
}
