import Link from "next/link";
import {
  listAppointmentsBetween,
  upcomingAppointments,
} from "@/lib/appointments";
import { listClients } from "@/lib/clients";
import { addDays, formatDate, formatDateShort, formatTime, todaySql } from "@/lib/dates";
import { formatMoney, incomeByMonth, listOutstanding } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const today = todaySql();
  const todaysAppointments = listAppointmentsBetween(today, addDays(today, 1));
  const upcoming = upcomingAppointments(8);
  const outstanding = listOutstanding();
  const clients = listClients();
  const income = incomeByMonth(Number(today.slice(0, 4)));

  const owedTotal = outstanding.reduce((sum, row) => sum + row.owedPence, 0);
  const thisMonth = income.months.find((m) => m.month === today.slice(0, 7));

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

      <div className="admin-grid admin-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="stat">
          <p className="stat-label">Today</p>
          <p className="stat-value">{todaysAppointments.length}</p>
          <p className="stat-note">
            {todaysAppointments.length === 1 ? "appointment" : "appointments"} booked
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value">{formatMoney(owedTotal)}</p>
          <p className="stat-note">
            across {outstanding.length}{" "}
            {outstanding.length === 1 ? "appointment" : "appointments"}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">This month</p>
          <p className="stat-value">{formatMoney(thisMonth?.totalPence ?? 0)}</p>
          <p className="stat-note">
            {formatMoney(income.totalPence)} so far in {today.slice(0, 4)}
          </p>
        </div>
      </div>

      <div className="admin-grid admin-grid-2">
        <section className="panel panel-flush">
          <h2>Today&rsquo;s diary</h2>
          {todaysAppointments.length === 0 ? (
            <p className="empty">
              Nothing booked today.{" "}
              <Link href="/admin/diary">Have a look at the week</Link>.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Client</th>
                    <th>Treatment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="num">{formatTime(appointment.startsAt)}</td>
                      <td>
                        <Link href={`/admin/clients/${appointment.clientId}`}>
                          {appointment.clientName}
                        </Link>
                      </td>
                      <td>{appointment.treatment}</td>
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

        <section className="panel">
          <h2>Coming up</h2>
          {upcoming.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", margin: 0 }}>
              Nothing else in the diary yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {upcoming.map((appointment) => (
                <li key={appointment.id} className="slot" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div>
                    <div className="slot-client">{appointment.clientName}</div>
                    <div className="slot-detail">{appointment.treatment}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="slot-time">{formatTime(appointment.startsAt)}</div>
                    <div className="slot-detail">
                      {formatDateShort(appointment.startsAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {outstanding.length > 0 && (
        <section className="panel panel-flush" style={{ marginTop: "1.5rem" }}>
          <h2>Waiting to be paid</h2>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Treatment</th>
                  <th className="num">Owed</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.slice(0, 8).map((row) => (
                  <tr key={row.appointmentId}>
                    <td>{formatDateShort(row.startsAt)}</td>
                    <td>
                      <Link href={`/admin/clients/${row.clientId}`}>
                        {row.clientName}
                      </Link>
                    </td>
                    <td>{row.treatment}</td>
                    <td className="num">
                      <span className="badge badge-owed">
                        {formatMoney(row.owedPence)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p style={{ marginTop: "2rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
        {clients.length} active {clients.length === 1 ? "client" : "clients"} on file.
      </p>
    </>
  );
}
