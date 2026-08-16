import { headers } from "next/headers";
import { clientIp } from "./auth";
import { getDb } from "./db";
import "server-only";

/**
 * A record of who did what to whose data.
 *
 * Two reasons this exists. If she ever has to answer a subject access request
 * ("who has seen my records?") she can answer it truthfully. And if anything
 * ever goes wrong, the ICO's first question is what the trail shows.
 */

export type AuditAction =
  | "login.success"
  | "login.failed"
  | "login.locked"
  | "logout"
  | "password.changed"
  | "twofactor.enabled"
  | "twofactor.disabled"
  | "client.viewed"
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.deleted"
  | "note.created"
  | "note.deleted"
  | "appointment.created"
  | "appointment.updated"
  | "appointment.deleted"
  | "payment.created"
  | "payment.deleted"
  | "backup.exported";

export async function logAudit(
  action: AuditAction,
  options: {
    userId?: number | null;
    entity?: string;
    entityId?: number;
    detail?: string;
  } = {},
) {
  const headerList = await headers();
  getDb()
    .prepare(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      options.userId ?? null,
      action,
      options.entity ?? null,
      options.entityId ?? null,
      options.detail ?? null,
      clientIp(headerList),
    );
}

export type AuditEntry = {
  id: number;
  action: string;
  entity: string | null;
  entity_id: number | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
  user_name: string | null;
};

export function recentAudit(limit = 100): AuditEntry[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.ip, a.created_at,
              u.name AS user_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(limit) as AuditEntry[];
}
