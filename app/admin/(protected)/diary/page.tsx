import type { Metadata } from "next";
import Link from "next/link";
import { listAppointmentsBetween } from "@/lib/appointments";
import {
  addDays,
  formatDate,
  formatTime,
  startOfWeek,
  todaySql,
} from "@/lib/dates";
import { formatMoney } from "@/lib/payments";

export const metadata: Metadata = { title: "Diary" };
export const dynamic = "force-dynamic";

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    booked?: string;
    skipped?: string;
  }>;
}) {
  const params = await searchParams;
  const today = todaySql();

  const requested = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "")
    ? params.week!
    : today;
  const weekStart = startOfWeek(requested);
  const weekEnd = addDays(weekStart, 7);

  const appointments = listAppointmentsBetween(weekStart, weekEnd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekTotal = appointments
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + a.pricePence, 0);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Diary</h1>
          <p>
            Week of {formatDate(weekStart, false)} —{" "}
            {appointments.length}{" "}
            {appointments.length === 1 ? "appointment" : "appointments"},{" "}
            {formatMoney(weekTotal)} booked
          </p>
        </div>
        <Link className="btn btn-primary btn-small" href="/admin/diary/new">
          Book an appointment
        </Link>
      </div>

      {params.booked && (
        <div className={params.skipped ? "callout callout-warn" : "callout"}>
          <h2>
            {params.booked} appointment{params.booked === "1" ? "" : "s"} booked
          </h2>
          {params.skipped ? (
            <p>
              These weeks were skipped because something was already in the
              diary: {params.skipped}. Book those separately once you&rsquo;ve
              rearranged them.
            </p>
          ) : (
            <p>The whole series went in without any clashes.</p>
          )}
        </div>
      )}

      <div className="toolbar">
        <Link
          className="btn btn-secondary btn-small"
          href={`/admin/diary?week=${addDays(weekStart, -7)}`}
        >
          ← Previous
        </Link>
        <Link className="btn btn-secondary btn-small" href="/admin/diary">
          This week
        </Link>
        <Link
          className="btn btn-secondary btn-small"
          href={`/admin/diary?week=${addDays(weekStart, 7)}`}
        >
          Next →
        </Link>
      </div>

      <section className="panel">
        {days.map((day) => {
          const dayAppointments = appointments.filter((a) =>
            a.startsAt.startsWith(day),
          );

          return (
            <div className="day-group" key={day}>
              <h2 className={`day-heading${day === today ? " is-today" : ""}`}>
                {formatDate(day)}
                {day === today && " · today"}
              </h2>

              {dayAppointments.length === 0 ? (
                <p
                  style={{
                    color: "var(--ink-soft)",
                    fontSize: "0.9rem",
                    padding: "0.9rem 0",
                    margin: 0,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  Nothing booked.
                </p>
              ) : (
                dayAppointments.map((appointment) => (
                  <div className="slot" key={appointment.id}>
                    <div className="slot-time">
                      {formatTime(appointment.startsAt)}
                    </div>
                    <div>
                      <div className="slot-client">
                        <Link href={`/admin/diary/${appointment.id}`}>
                          {appointment.clientName}
                        </Link>
                      </div>
                      <div className="slot-detail">
                        {appointment.treatment} · {appointment.durationMins} mins
                        {appointment.pricePence > 0 &&
                          ` · ${formatMoney(appointment.pricePence)}`}
                      </div>
                    </div>
                    <div>
                      <span className={`badge badge-${appointment.status}`}>
                        {appointment.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
