import type { Metadata } from "next";
import Link from "next/link";
import { markDone, markOpen, removeTask } from "./actions";
import TaskComposer from "@/components/admin/TaskComposer";
import { listClients } from "@/lib/clients";
import { formatDateShort, todaySql } from "@/lib/dates";
import { assignableStaff } from "@/lib/team";
import { listTasks, type Task } from "@/lib/tasks";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
] as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; who?: string }>;
}) {
  const params = await searchParams;
  const show = FILTERS.some((f) => f.key === params.show)
    ? (params.show as (typeof FILTERS)[number]["key"])
    : "open";

  const staff = assignableStaff();
  const who = params.who;
  const assigneeId =
    who === "unassigned" ? ("unassigned" as const) : who ? Number(who) : undefined;

  const tasks = listTasks({
    status: show === "done" ? "done" : "open",
    overdueOnly: show === "overdue",
    assigneeId,
  });

  const today = todaySql();
  const overdue = tasks.filter((t) => t.isOverdue);
  const dueToday = tasks.filter((t) => t.dueOn === today && !t.isOverdue);
  const later = tasks.filter((t) => !t.isOverdue && t.dueOn !== today);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Tasks</h1>
          <p>
            Everything that needs doing, in one place — including the chores the
            practice generates for itself.
          </p>
        </div>
      </div>

      <TaskComposer staff={staff} clients={listClients()} />

      <div className="toolbar">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            className={`btn btn-small ${show === f.key ? "btn-primary" : "btn-secondary"}`}
            href={`/admin/tasks?show=${f.key}${who ? `&who=${who}` : ""}`}
          >
            {f.label}
          </Link>
        ))}
        <span style={{ flex: 1 }} />
        <Link
          className={`btn btn-small ${!who ? "btn-primary" : "btn-secondary"}`}
          href={`/admin/tasks?show=${show}`}
        >
          Everyone
        </Link>
        {staff.map((member) => (
          <Link
            key={member.id}
            className={`btn btn-small ${
              who === String(member.id) ? "btn-primary" : "btn-secondary"
            }`}
            href={`/admin/tasks?show=${show}&who=${member.id}`}
          >
            {member.name.split(" ")[0]}
          </Link>
        ))}
        <Link
          className={`btn btn-small ${
            who === "unassigned" ? "btn-primary" : "btn-secondary"
          }`}
          href={`/admin/tasks?show=${show}&who=unassigned`}
        >
          Unassigned
        </Link>
      </div>

      {tasks.length === 0 ? (
        <section className="panel">
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            {show === "done"
              ? "Nothing finished yet."
              : "Nothing outstanding. Genuinely — the list is empty."}
          </p>
        </section>
      ) : (
        <>
          <TaskGroup title="Overdue" tasks={overdue} tone="warn" />
          <TaskGroup title="Due today" tasks={dueToday} />
          <TaskGroup
            title={show === "done" ? "Completed" : "Later, and undated"}
            tasks={later}
          />
        </>
      )}
    </>
  );
}

function TaskGroup({
  title,
  tasks,
  tone,
}: {
  title: string;
  tasks: Task[];
  tone?: "warn";
}) {
  if (tasks.length === 0) return null;

  return (
    <section className="panel panel-flush" style={{ marginBottom: "1.5rem" }}>
      <h2 style={tone === "warn" ? { color: "var(--accent)" } : undefined}>
        {title} <span style={{ color: "var(--ink-soft)" }}>({tasks.length})</span>
      </h2>
      <div className="table-scroll">
        <table className="data">
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td style={{ width: "3rem" }}>
                  <form action={task.status === "open" ? markDone.bind(null, task.id) : markOpen.bind(null, task.id)}>
                    <button
                      className="task-check"
                      type="submit"
                      aria-label={task.status === "open" ? "Mark done" : "Reopen"}
                      data-done={task.status === "done" ? "true" : undefined}
                    >
                      {task.status === "done" ? "✓" : ""}
                    </button>
                  </form>
                </td>
                <td>
                  <div
                    style={{
                      fontWeight: 600,
                      textDecoration:
                        task.status === "done" ? "line-through" : undefined,
                      opacity: task.status === "done" ? 0.6 : 1,
                    }}
                  >
                    {task.title}
                  </div>
                  {task.detail && <div className="slot-detail">{task.detail}</div>}
                  <div className="slot-detail">
                    {task.clientId && (
                      <>
                        <Link href={`/admin/clients/${task.clientId}`}>
                          {task.clientName}
                        </Link>
                        {" · "}
                      </>
                    )}
                    {task.assigneeName ?? "Unassigned"}
                    {task.repeatEvery && ` · repeats ${task.repeatEvery}`}
                    {task.source !== "manual" && ` · added automatically`}
                  </div>
                </td>
                <td className="num">
                  {task.priority !== "normal" && (
                    <span className={`badge badge-priority-${task.priority}`}>
                      {task.priority}
                    </span>
                  )}
                </td>
                <td className="num">
                  {task.dueOn ? (
                    <span className={task.isOverdue ? "badge badge-owed" : undefined}>
                      {formatDateShort(task.dueOn)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-soft)" }}>—</span>
                  )}
                </td>
                <td className="num">
                  <form action={removeTask.bind(null, task.id)}>
                    <button
                      className="link-button"
                      type="submit"
                      style={{ color: "var(--ink-soft)", fontSize: "0.82rem" }}
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
