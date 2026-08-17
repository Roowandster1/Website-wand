import Link from "next/link";
import { listAppointmentsBetween } from "@/lib/appointments";
import { addDays, formatDate, formatDateShort, formatTime, todaySql } from "@/lib/dates";
import { listOpenEnquiries } from "@/lib/enquiries";
import { formatMoney, listOutstanding } from "@/lib/payments";
import { absencesToday } from "@/lib/team";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/**
 * Today.
 *
 * Built around one rule: only show what needs a decision. A wall of numbers
 * that is green every morning stops being read within a week, so anything
 * healthy stays quiet and the sections that need attention are the ones that
 * appear at all.
 */
export default function TodayPage() {
  const today = todaySql();

  const sessions = listAppointmentsBetween(today, addDays(today, 1));
  const attending = sessions.filter((s) => s.status !== "cancelled");
  const cancelled = sessions.filter((s) => s.status === "cancelled");

  const overdueTasks = listTasks({ overdueOnly: true });
  const dueToday = listTasks().filter((t) => t.dueOn === today && !t.isOverdue);

  const enquiries = listOpenEnquiries();
  const newEnquiries = enquiries.filter((e) => e.stage === "new");
  const away = absencesToday();
  const outstanding = listOutstanding();
  const owed = outstanding.reduce((sum, row) => sum + row.owedPence, 0);

  const nothingPressing =
    attending.length === 0 &&
    overdueTasks.length === 0 &&
    dueToday.length === 0 &&
    newEnquiries.length === 0 &&
    away.length === 0;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Today</h1>
          <p>{formatDate(today)}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn btn-secondary btn-small" href="/admin/diary/new">
            Book an appointment
          </Link>
          <Link className="btn btn-primary btn-small" href="/admin/clients/new">
            Add a client
          </Link>
        </div>
      </div>

      {nothingPressing && (
        <div className="callout">
          <h2>Nothing needs you this morning</h2>
          <p>
            No sessions, no overdue tasks, no unanswered enquiries. This section
            only fills up when something wants a decision.
          </p>
        </div>
      )}

      {/* Attention first: overdue work, then unanswered people. */}
      {overdueTasks.length > 0 && (
        <section className="panel panel-flush" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ color: "var(--accent)" }}>
            Overdue ({overdueTasks.length})
          </h2>
          <div className="table-scroll">
            <table className="data">
              <tbody>
                {overdueTasks.slice(0, 6).map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      <div className="slot-detail">
                        {task.assigneeName ?? "Unassigned"}
                        {task.clientName && ` · ${task.clientName}`}
                      </div>
                    </td>
                    <td className="num">
                      <span className="badge badge-owed">
                        due {formatDateShort(task.dueOn!)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ padding: "0.85rem 1.15rem", margin: 0 }}>
            <Link href="/admin/tasks?show=overdue">See all overdue</Link>
          </p>
        </section>
      )}

      {newEnquiries.length > 0 && (
        <section className="panel panel-flush" style={{ marginBottom: "1.5rem" }}>
          <h2>Unanswered enquiries ({newEnquiries.length})</h2>
          <div className="table-scroll">
            <table className="data">
              <tbody>
                {newEnquiries.slice(0, 5).map((enquiry) => (
                  <tr key={enquiry.id}>
                    <td>
                      <strong>{enquiry.name}</strong>
                      <div className="slot-detail">
                        {enquiry.referralSource || "Source unknown"} ·{" "}
                        {formatDateShort(enquiry.createdAt)}
                      </div>
                    </td>
                    <td className="num">
                      <Link href="/admin/enquiries">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="admin-grid admin-grid-2">
        <section className="panel panel-flush">
          <h2>Sessions today ({attending.length})</h2>
          {attending.length === 0 ? (
            <p className="empty">
              Nothing booked. <Link href="/admin/diary">Look at the week</Link>.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attending.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="num">{formatTime(appointment.startsAt)}</td>
                      <td>
                        <Link href={`/admin/clients/${appointment.clientId}`}>
                          {appointment.clientName}
                        </Link>
                        <div className="slot-detail">{appointment.treatment}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${appointment.status}`}>
                          {appointment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: "1.5rem", alignContent: "start" }}>
          {away.length > 0 && (
            <section className="panel">
              <h2>Away today</h2>
              <ul className="detail-list" style={{ marginTop: "0.5rem" }}>
                {away.map((absence) => (
                  <li key={absence.id}>
                    <span>{absence.userName}</span>
                    <span className="muted">
                      {absence.reason ?? "Away"} · until{" "}
                      {formatDateShort(absence.endsOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cancelled.length > 0 && (
            <section className="panel">
              <h2>Cancelled today ({cancelled.length})</h2>
              <ul className="detail-list" style={{ marginTop: "0.5rem" }}>
                {cancelled.map((appointment) => (
                  <li key={appointment.id}>
                    <span>{appointment.clientName}</span>
                    <span className="muted">
                      {formatTime(appointment.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dueToday.length > 0 && (
            <section className="panel">
              <h2>Due today ({dueToday.length})</h2>
              <ul className="tick-list" style={{ marginTop: "0.5rem" }}>
                {dueToday.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    {task.title}
                    <span style={{ color: "var(--ink-soft)" }}>
                      {" "}
                      — {task.assigneeName ?? "unassigned"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {owed > 0 && (
            <section className="panel">
              <h2>Waiting to be paid</h2>
              <p className="stat-value" style={{ fontSize: "1.6rem" }}>
                {formatMoney(owed)}
              </p>
              <p className="stat-note">
                across {outstanding.length}{" "}
                {outstanding.length === 1 ? "appointment" : "appointments"} ·{" "}
                <Link href="/admin/payments">Open payments</Link>
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
