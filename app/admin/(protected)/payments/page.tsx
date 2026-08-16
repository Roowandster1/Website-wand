import type { Metadata } from "next";
import Link from "next/link";
import { removePayment } from "./actions";
import { formatDateShort, todaySql } from "@/lib/dates";
import {
  formatMoney,
  incomeByMonth,
  listOutstanding,
  listPayments,
} from "@/lib/payments";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const currentYear = Number(todaySql().slice(0, 4));
  const year = /^\d{4}$/.test(params.year ?? "")
    ? Number(params.year)
    : currentYear;

  const income = incomeByMonth(year);
  const outstanding = listOutstanding();
  const payments = listPayments(`${year}-01-01`, `${year + 1}-01-01`);
  const owedTotal = outstanding.reduce((sum, row) => sum + row.owedPence, 0);
  const peak = Math.max(...income.months.map((m) => m.totalPence), 1);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Payments</h1>
          <p>
            {formatMoney(income.totalPence)} received in {year} across{" "}
            {income.count} {income.count === 1 ? "payment" : "payments"}
          </p>
        </div>
        <Link className="btn btn-primary btn-small" href="/admin/payments/new">
          Record a payment
        </Link>
      </div>

      <div className="toolbar">
        <Link
          className="btn btn-secondary btn-small"
          href={`/admin/payments?year=${year - 1}`}
        >
          ← {year - 1}
        </Link>
        {year !== currentYear && (
          <Link className="btn btn-secondary btn-small" href="/admin/payments">
            This year
          </Link>
        )}
        {year < currentYear && (
          <Link
            className="btn btn-secondary btn-small"
            href={`/admin/payments?year=${year + 1}`}
          >
            {year + 1} →
          </Link>
        )}
      </div>

      <div className="admin-grid admin-grid-2">
        <section className="panel">
          <h2>Income by month, {year}</h2>
          {income.months.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", margin: 0 }}>
              Nothing recorded for {year} yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {income.months.map((month) => {
                const label = MONTH_NAMES[Number(month.month.slice(5, 7)) - 1];
                return (
                  <li
                    key={month.month}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "3rem 1fr 5.5rem",
                      alignItems: "center",
                      gap: "0.85rem",
                      padding: "0.4rem 0",
                    }}
                  >
                    <span style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                      {label}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "block",
                        height: "0.6rem",
                        borderRadius: "999px",
                        background: "var(--clay)",
                        width: `${Math.max((month.totalPence / peak) * 100, 2)}%`,
                      }}
                    />
                    <span
                      className="num"
                      style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoney(month.totalPence)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p
            style={{
              borderTop: "1px solid var(--line)",
              marginTop: "1rem",
              paddingTop: "1rem",
              marginBottom: 0,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <strong>Total for {year}</strong>
            <strong>{formatMoney(income.totalPence)}</strong>
          </p>
        </section>

        <section className="panel panel-flush">
          <h2>Still owed</h2>
          {outstanding.length === 0 ? (
            <p className="empty">Everything&rsquo;s been paid. </p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th className="num">Owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.map((row) => (
                      <tr key={row.appointmentId}>
                        <td>{formatDateShort(row.startsAt)}</td>
                        <td>
                          <Link href={`/admin/clients/${row.clientId}`}>
                            {row.clientName}
                          </Link>
                          <div className="slot-detail">{row.treatment}</div>
                        </td>
                        <td className="num">
                          <Link
                            href={`/admin/payments/new?appointment=${row.appointmentId}`}
                          >
                            {formatMoney(row.owedPence)}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p
                style={{
                  padding: "1rem 1.5rem",
                  margin: 0,
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <strong>Total outstanding</strong>
                <strong>{formatMoney(owedTotal)}</strong>
              </p>
            </>
          )}
        </section>
      </div>

      <section className="panel panel-flush" style={{ marginTop: "1.5rem" }}>
        <h2>Payments received in {year}</h2>
        {payments.length === 0 ? (
          <p className="empty">Nothing recorded yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Method</th>
                  <th>Note</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateShort(payment.paidAt)}</td>
                    <td>
                      <Link href={`/admin/clients/${payment.clientId}`}>
                        {payment.clientName}
                      </Link>
                    </td>
                    <td>
                      <span className="badge">{payment.method}</span>
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      {payment.note || "—"}
                    </td>
                    <td className="num">{formatMoney(payment.amountPence)}</td>
                    <td className="num">
                      <form action={removePayment.bind(null, payment.id)}>
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
        )}
      </section>

      <div className="callout" style={{ marginTop: "1.5rem" }}>
        <h2>For the accountant</h2>
        <p>
          {formatMoney(income.totalPence)} received in {year}. Note that this is
          the calendar year — the UK tax year runs 6 April to 5 April, so check
          which basis your accountant wants before handing the figure over.
        </p>
      </div>
    </>
  );
}
