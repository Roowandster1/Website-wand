import type { Metadata } from "next";
import Link from "next/link";
import { formatDateShort } from "@/lib/dates";
import { listTeam, upcomingAbsences } from "@/lib/team";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const team = listTeam();
  const absences = upcomingAbsences();

  const busiest = Math.max(...team.map((m) => m.openTasks), 1);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Team</h1>
          <p>
            Who is carrying what. {team.length}{" "}
            {team.length === 1 ? "person" : "people"} on the books.
          </p>
        </div>
      </div>

      {team.length === 1 && (
        <div className="callout">
          <h2>Only one account so far</h2>
          <p>
            Workload comparisons and task assignment come into their own with
            more than one person. Adding staff needs an invitation flow, which
            isn&rsquo;t built yet — say the word and it&rsquo;s next.
          </p>
        </div>
      )}

      <section className="panel panel-flush" style={{ marginBottom: "1.5rem" }}>
        <h2>Workload</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th className="num">Today</th>
                <th className="num">Clients</th>
                <th>Open tasks</th>
                <th className="num">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <div className="slot-detail">{member.email}</div>
                    {member.isAwayToday && (
                      <span className="badge badge-owed">Away today</span>
                    )}
                    {!member.isActive && <span className="badge">Inactive</span>}
                  </td>
                  <td>
                    <span className="badge">{member.jobTitle ?? member.role}</span>
                  </td>
                  <td className="num">{member.sessionsToday}</td>
                  <td className="num">{member.activeClients}</td>
                  <td>
                    {/* A bar rather than a number: the useful question is who is
                        carrying more than the others, not the absolute count. */}
                    <div className="bars" style={{ margin: 0 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 3.5rem", gap: "0.6rem", alignItems: "center" }}>
                        <span className="bars-track">
                          <span
                            className="bars-fill"
                            style={{
                              width: `${Math.max((member.openTasks / busiest) * 100, member.openTasks > 0 ? 4 : 0)}%`,
                              background:
                                member.overdueTasks > 0
                                  ? "var(--accent)"
                                  : undefined,
                            }}
                          />
                        </span>
                        <span className="bars-value">
                          {member.openTasks}
                          {member.overdueTasks > 0 && (
                            <span style={{ color: "var(--accent)" }}>
                              {" "}
                              ({member.overdueTasks}!)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="num" style={{ color: "var(--ink-soft)" }}>
                    {member.lastLoginAt
                      ? formatDateShort(member.lastLoginAt)
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-flush">
        <h2>Time off</h2>
        {absences.length === 0 ? (
          <p className="empty">
            Nothing booked. Recording absences here keeps them off the diary and
            explains a quiet day on Today.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>From</th>
                  <th>Until</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((absence) => (
                  <tr key={absence.id}>
                    <td>{absence.userName}</td>
                    <td>{formatDateShort(absence.startsOn)}</td>
                    <td>{formatDateShort(absence.endsOn)}</td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {absence.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ marginTop: "1.5rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
        Assign work from <Link href="/admin/tasks">Tasks</Link>.
      </p>
    </>
  );
}
