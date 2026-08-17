import type { Metadata } from "next";
import Link from "next/link";
import Bars from "@/components/admin/Bars";
import {
  attendanceSummary,
  busiestHours,
  busiestWeekdays,
  lapsedClients,
  retentionSummary,
  topClients,
  treatmentPerformance,
} from "@/lib/analytics";
import { addDays, formatDateShort, todaySql } from "@/lib/dates";
import { formatMoney } from "@/lib/payments";
import { siteStats } from "@/lib/pageviews";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "12 months" },
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = RANGES.some((r) => String(r.days) === params.days)
    ? Number(params.days)
    : 90;

  const since = addDays(todaySql(), -days);
  const treatments = treatmentPerformance(since);
  const attendance = attendanceSummary(since);
  const hours = busiestHours(since);
  const weekdays = busiestWeekdays(since);
  const retention = retentionSummary();
  const lapsed = lapsedClients(90);
  const earners = topClients(since);
  const web = siteStats(Math.min(days, 90));

  const totalRevenue = treatments.reduce((s, t) => s + t.revenuePence, 0);

  // Only meaningful once some appointments have actually come and gone. With
  // nothing to divide, "0%" would read as "nobody turns up" rather than
  // "nothing has happened yet", which is alarming and untrue.
  const settled = attendance.attended + attendance.noShow;
  const attendedRate = settled > 0 ? attendance.attended / settled : null;
  const returnRate =
    retention.totalClients > 0
      ? retention.returning / retention.totalClients
      : null;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Reports</h1>
          <p>How the practice is doing over the last {days} days.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {RANGES.map((range) => (
            <Link
              key={range.days}
              className={`btn btn-small ${
                range.days === days ? "btn-primary" : "btn-secondary"
              }`}
              href={`/admin/reports?days=${range.days}`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="admin-grid admin-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="stat">
          <p className="stat-label">Earned</p>
          <p className="stat-value">{formatMoney(totalRevenue)}</p>
          <p className="stat-note">from {attendance.attended} attended sessions</p>
        </div>
        <div className="stat">
          <p className="stat-label">Turn up rate</p>
          <p className="stat-value">
            {attendedRate === null ? "—" : `${Math.round(attendedRate * 100)}%`}
          </p>
          <p className="stat-note">
            {attendedRate === null
              ? "Nothing has been and gone yet"
              : `${attendance.noShow} didn't turn up${
                  attendance.lostPence > 0
                    ? ` · ${formatMoney(attendance.lostPence)} lost`
                    : ""
                }`}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Come back again</p>
          <p className="stat-value">
            {returnRate === null ? "—" : `${Math.round(returnRate * 100)}%`}
          </p>
          <p className="stat-note">
            {returnRate === null
              ? "Nobody has been seen yet"
              : `${retention.returning} of ${retention.totalClients} have been more than once`}
          </p>
        </div>
      </div>

      <div className="admin-grid admin-grid-2">
        <section className="panel panel-flush">
          <h2>Which treatments earn most</h2>
          {treatments.length === 0 ? (
            <p className="empty">Nothing booked in this period yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Treatment</th>
                    <th className="num">Booked</th>
                    <th className="num">Kept</th>
                    <th className="num">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((t) => (
                    <tr key={t.treatment}>
                      <td>{t.treatment}</td>
                      <td className="num">{t.bookings}</td>
                      <td className="num">{t.attended}</td>
                      <td className="num">
                        <strong>{formatMoney(t.revenuePence)}</strong>
                        <div className="slot-detail">
                          {formatMoney(t.averagePence)} each
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>When people actually come</h2>
          <h3 style={{ fontSize: "0.95rem", fontFamily: "var(--sans)" }}>
            By day
          </h3>
          <Bars
            items={weekdays.map((w) => ({ label: w.weekday.slice(0, 3), value: w.count }))}
            emptyText="No appointments yet."
          />
          <h3
            style={{
              fontSize: "0.95rem",
              fontFamily: "var(--sans)",
              marginTop: "1.5rem",
            }}
          >
            By hour
          </h3>
          <Bars
            items={hours.map((h) => ({
              label: `${h.hour % 12 === 0 ? 12 : h.hour % 12}${h.hour < 12 ? "am" : "pm"}`,
              value: h.count,
            }))}
            emptyText="No appointments yet."
          />
          <p className="form-note" style={{ marginTop: "1rem" }}>
            Hours that never fill are hours worth not offering.
          </p>
        </section>
      </div>

      <div className="admin-grid admin-grid-2" style={{ marginTop: "1.5rem" }}>
        <section className="panel panel-flush">
          <h2>Haven&rsquo;t been in a while</h2>
          <p
            style={{
              padding: "0 1.5rem",
              color: "var(--ink-soft)",
              fontSize: "0.9rem",
            }}
          >
            Regulars who haven&rsquo;t been for over 90 days. They already know
            and trust you — a friendly note is usually all it takes.
          </p>
          {lapsed.length === 0 ? (
            <p className="empty">Nobody has drifted off. </p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="num">Visits</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {lapsed.slice(0, 10).map((client) => (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/admin/clients/${client.id}`}>
                          {client.fullName}
                        </Link>
                        {client.phone && (
                          <div className="slot-detail">{client.phone}</div>
                        )}
                      </td>
                      <td className="num">{client.visits}</td>
                      <td>{formatDateShort(client.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel panel-flush">
          <h2>Most valuable clients</h2>
          {earners.length === 0 ? (
            <p className="empty">Nothing recorded in this period.</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="num">Visits</th>
                    <th className="num">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {earners.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/admin/clients/${client.id}`}>
                          {client.fullName}
                        </Link>
                      </td>
                      <td className="num">{client.visits}</td>
                      <td className="num">{formatMoney(client.spentPence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <h2>The website</h2>
        <p style={{ color: "var(--ink-soft)" }}>
          {web.totalViews} page views in the last {Math.min(days, 90)} days
          {web.totalViews > 0 && (
            <>
              {" "}
              · {Math.round(web.mobileShare * 100)}% on a phone
              {web.contactRate > 0 &&
                ` · ${Math.round(web.contactRate * 100)}% of home page visitors reached the contact page`}
            </>
          )}
          .
        </p>

        {web.totalViews === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing recorded yet. Views are counted from the moment the site
            goes live — there&rsquo;s no tracking script, no cookies and no
            third party involved, so nothing needs a consent banner.
          </p>
        ) : (
          <div className="admin-grid admin-grid-2" style={{ marginTop: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontFamily: "var(--sans)" }}>
                Most looked at
              </h3>
              <Bars
                items={web.byPath.map((p) => ({
                  label: p.path === "/" ? "Home" : p.path.replace(/\//g, " ").trim(),
                  value: p.views,
                }))}
                emptyText="No views yet."
              />
            </div>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontFamily: "var(--sans)" }}>
                Where visitors came from
              </h3>
              <Bars
                items={web.byReferrer.map((r) => ({
                  label: r.referrer,
                  value: r.views,
                }))}
                emptyText="No views yet."
              />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
