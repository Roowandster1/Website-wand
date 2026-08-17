import { addDays, nowSql, todaySql } from "./dates";
import { getDb } from "./db";
import "server-only";

/**
 * The one master to-do list.
 *
 * Deliberately a single table rather than a to-do per area. The point of it is
 * that nothing needing doing lives anywhere else — so when a workflow later
 * generates "complete notes for this session" or "send intake forms", it lands
 * here alongside the things a person typed, and one list is the whole picture.
 *
 * Titles are treated as non-clinical and stored in the clear so tasks can be
 * listed and searched. Anything revealing belongs in the client's record, and
 * the task should point at the client rather than repeat it.
 */

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REPEATS = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
} as const;
export type Repeat = keyof typeof REPEATS;

export type Task = {
  id: number;
  title: string;
  detail: string;
  dueOn: string | null;
  priority: Priority;
  status: "open" | "done";
  assigneeId: number | null;
  assigneeName: string | null;
  clientId: number | null;
  clientName: string | null;
  source: string;
  repeatEvery: Repeat | null;
  completedAt: string | null;
  isOverdue: boolean;
  createdAt: string;
};

type Row = {
  id: number;
  title: string;
  detail: string | null;
  due_on: string | null;
  priority: Priority;
  status: "open" | "done";
  assignee_id: number | null;
  assignee_name: string | null;
  client_id: number | null;
  client_name: string | null;
  source: string;
  repeat_every: Repeat | null;
  completed_at: string | null;
  created_at: string;
};

const SELECT = `
  SELECT t.id, t.title, t.detail, t.due_on, t.priority, t.status,
         t.assignee_id, t.client_id, t.source, t.repeat_every, t.completed_at,
         t.created_at,
         u.name AS assignee_name,
         (c.first_name || ' ' || c.last_name) AS client_name
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN clients c ON c.id = t.client_id
`;

function hydrate(row: Row, today: string): Task {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail ?? "",
    dueOn: row.due_on,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    clientId: row.client_id,
    clientName: row.client_name,
    source: row.source,
    repeatEvery: row.repeat_every,
    completedAt: row.completed_at,
    isOverdue: row.status === "open" && !!row.due_on && row.due_on < today,
    createdAt: row.created_at,
  };
}

export type TaskFilter = {
  status?: "open" | "done" | "all";
  assigneeId?: number | "unassigned";
  clientId?: number;
  overdueOnly?: boolean;
};

export function listTasks(filter: TaskFilter = {}): Task[] {
  const today = todaySql();
  const where: string[] = [];
  const params: unknown[] = [];

  if (!filter.status || filter.status === "open") where.push("t.status = 'open'");
  else if (filter.status === "done") where.push("t.status = 'done'");

  if (filter.assigneeId === "unassigned") where.push("t.assignee_id IS NULL");
  else if (typeof filter.assigneeId === "number") {
    where.push("t.assignee_id = ?");
    params.push(filter.assigneeId);
  }

  if (filter.clientId) {
    where.push("t.client_id = ?");
    params.push(filter.clientId);
  }

  if (filter.overdueOnly) {
    where.push("t.status = 'open' AND t.due_on IS NOT NULL AND t.due_on < ?");
    params.push(today);
  }

  const rows = getDb()
    .prepare(
      `${SELECT}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY
         CASE WHEN t.due_on IS NULL THEN 1 ELSE 0 END,
         t.due_on,
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                         WHEN 'normal' THEN 2 ELSE 3 END,
         t.id DESC`,
    )
    .all(...params) as Row[];

  return rows.map((row) => hydrate(row, today));
}

export function countOverdue(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status = 'open' AND due_on IS NOT NULL AND due_on < ?`,
    )
    .get(todaySql()) as { n: number };
  return row.n;
}

export type TaskInput = {
  title: string;
  detail?: string;
  dueOn?: string | null;
  priority?: Priority;
  assigneeId?: number | null;
  clientId?: number | null;
  repeatEvery?: Repeat | null;
  source?: string;
  createdBy?: number | null;
};

export function createTask(input: TaskInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO tasks
         (title, detail, due_on, priority, assignee_id, client_id,
          repeat_every, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.detail || null,
      input.dueOn || null,
      input.priority ?? "normal",
      input.assigneeId ?? null,
      input.clientId ?? null,
      input.repeatEvery ?? null,
      input.source ?? "manual",
      input.createdBy ?? null,
    );
  return Number(result.lastInsertRowid);
}

/**
 * Marks a task done, and if it repeats, immediately queues the next one.
 *
 * The next occurrence is measured from the due date rather than from today, so
 * a weekly chore completed two days late stays on its original rhythm instead
 * of drifting later every time.
 */
export function completeTask(id: number): void {
  const db = getDb();

  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND status = 'open'")
    .get(id) as
    | {
        id: number;
        title: string;
        detail: string | null;
        due_on: string | null;
        priority: Priority;
        assignee_id: number | null;
        client_id: number | null;
        repeat_every: Repeat | null;
        created_by: number | null;
      }
    | undefined;

  if (!task) return;

  const finish = db.transaction(() => {
    db.prepare(
      `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(nowSql(), id);

    if (task.repeat_every && task.repeat_every in REPEATS) {
      const step = REPEATS[task.repeat_every];
      const base = task.due_on ?? todaySql();
      createTask({
        title: task.title,
        detail: task.detail ?? undefined,
        dueOn: addDays(base, step),
        priority: task.priority,
        assigneeId: task.assignee_id,
        clientId: task.client_id,
        repeatEvery: task.repeat_every,
        source: "recurring",
        createdBy: task.created_by,
      });
    }
  });

  finish();
}

export function reopenTask(id: number): void {
  getDb()
    .prepare(
      `UPDATE tasks SET status = 'open', completed_at = NULL,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(id);
}

export function deleteTask(id: number): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function assignTask(id: number, assigneeId: number | null): void {
  getDb()
    .prepare(
      "UPDATE tasks SET assignee_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(assigneeId, id);
}
