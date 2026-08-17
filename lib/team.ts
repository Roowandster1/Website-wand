import { todaySql } from "./dates";
import { getDb } from "./db";
import "server-only";

/**
 * Staff, their roles, and how much is on each of them.
 *
 * Roles are coarse on purpose. A practice this size does not need fine-grained
 * permissions, and inventing twenty of them creates a maintenance problem
 * without making anything safer:
 *
 *   owner      — runs the practice; sees everything, manages staff
 *   therapist  — sees their own caseload and the diary
 *   admin      — logistics: enquiries, diary, payments; not clinical notes
 */
export const ROLES = ["owner", "therapist", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Member = {
  id: number;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  photoPath: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  /** Live workload, so it is obvious who is carrying too much. */
  openTasks: number;
  overdueTasks: number;
  activeClients: number;
  sessionsToday: number;
  isAwayToday: boolean;
};

export function listTeam(): Member[] {
  const today = todaySql();

  return getDb()
    .prepare(
      `SELECT u.id, u.name, u.email,
              COALESCE(u.role, 'owner')      AS role,
              u.job_title                    AS jobTitle,
              u.photo_path                   AS photoPath,
              COALESCE(u.is_active, 1)       AS isActiveInt,
              u.last_login_at                AS lastLoginAt,
              (SELECT COUNT(*) FROM tasks t
                 WHERE t.assignee_id = u.id AND t.status = 'open') AS openTasks,
              (SELECT COUNT(*) FROM tasks t
                 WHERE t.assignee_id = u.id AND t.status = 'open'
                   AND t.due_on IS NOT NULL AND t.due_on < ?)      AS overdueTasks,
              (SELECT COUNT(*) FROM clients c
                 WHERE c.therapist_id = u.id AND c.is_archived = 0
                   AND COALESCE(c.status, 'active') = 'active')    AS activeClients,
              (SELECT COUNT(*) FROM appointments a
                 JOIN clients c2 ON c2.id = a.client_id
                 WHERE c2.therapist_id = u.id
                   AND date(a.starts_at) = ?
                   AND a.status != 'cancelled')                    AS sessionsToday,
              (SELECT COUNT(*) FROM absences ab
                 WHERE ab.user_id = u.id
                   AND ? BETWEEN ab.starts_on AND ab.ends_on)      AS awayInt
       FROM users u
       ORDER BY COALESCE(u.is_active, 1) DESC, u.name COLLATE NOCASE`,
    )
    .all(today, today, today)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as number,
        name: row.name as string,
        email: row.email as string,
        role: row.role as Role,
        jobTitle: (row.jobTitle as string | null) ?? null,
        photoPath: (row.photoPath as string | null) ?? null,
        isActive: row.isActiveInt === 1,
        lastLoginAt: (row.lastLoginAt as string | null) ?? null,
        openTasks: row.openTasks as number,
        overdueTasks: row.overdueTasks as number,
        activeClients: row.activeClients as number,
        sessionsToday: row.sessionsToday as number,
        isAwayToday: (row.awayInt as number) > 0,
      };
    });
}

/** Just enough for a dropdown of who a task or client can be assigned to. */
export function assignableStaff(): Array<{ id: number; name: string; role: Role }> {
  return getDb()
    .prepare(
      `SELECT id, name, COALESCE(role, 'owner') AS role FROM users
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ id: number; name: string; role: Role }>;
}

export type Absence = {
  id: number;
  userId: number;
  userName: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
};

export function absencesToday(): Absence[] {
  const today = todaySql();
  return getDb()
    .prepare(
      `SELECT ab.id, ab.user_id AS userId, u.name AS userName,
              ab.starts_on AS startsOn, ab.ends_on AS endsOn, ab.reason
       FROM absences ab JOIN users u ON u.id = ab.user_id
       WHERE ? BETWEEN ab.starts_on AND ab.ends_on
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(today) as Absence[];
}

export function upcomingAbsences(limit = 20): Absence[] {
  return getDb()
    .prepare(
      `SELECT ab.id, ab.user_id AS userId, u.name AS userName,
              ab.starts_on AS startsOn, ab.ends_on AS endsOn, ab.reason
       FROM absences ab JOIN users u ON u.id = ab.user_id
       WHERE ab.ends_on >= ?
       ORDER BY ab.starts_on LIMIT ?`,
    )
    .all(todaySql(), limit) as Absence[];
}

export function recordAbsence(input: {
  userId: number;
  startsOn: string;
  endsOn: string;
  reason?: string;
}): number {
  const result = getDb()
    .prepare(
      "INSERT INTO absences (user_id, starts_on, ends_on, reason) VALUES (?, ?, ?, ?)",
    )
    .run(input.userId, input.startsOn, input.endsOn, input.reason || null);
  return Number(result.lastInsertRowid);
}

export function deleteAbsence(id: number): void {
  getDb().prepare("DELETE FROM absences WHERE id = ?").run(id);
}
