import type { Metadata } from "next";
import { moveStage } from "./actions";
import EnquiryComposer from "@/components/admin/EnquiryComposer";
import { formatDateShort, todaySql } from "@/lib/dates";
import { listOpenEnquiries, stageCounts } from "@/lib/enquiries";
import {
  OPEN_STAGES,
  STAGE_LABELS,
  STAGE_NEXT_ACTION,
  type Stage,
} from "@/lib/pipeline";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

/** Whole days between two dates, for showing how long someone has waited. */
function daysSince(iso: string, today: string): number {
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export default async function EnquiriesPage() {
  const enquiries = listOpenEnquiries();
  const counts = stageCounts();
  const today = todaySql();

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Enquiries</h1>
          <p>
            {enquiries.length} in progress. Oldest first, because the longest
            wait is the one most likely to have been forgotten.
          </p>
        </div>
      </div>

      <EnquiryComposer />

      <div className="admin-grid admin-grid-3" style={{ marginBottom: "1.5rem" }}>
        {counts.slice(0, 3).map((entry) => (
          <div className="stat" key={entry.stage}>
            <p className="stat-label">{STAGE_LABELS[entry.stage]}</p>
            <p className="stat-value">{entry.count}</p>
            <p className="stat-note">{STAGE_NEXT_ACTION[entry.stage]}</p>
          </div>
        ))}
      </div>

      {enquiries.length === 0 ? (
        <section className="panel">
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>
            No enquiries in progress. New ones will appear here — and once the
            website form is wired up, automatically.
          </p>
        </section>
      ) : (
        <section className="panel panel-flush">
          <h2>In progress</h2>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Came from</th>
                  <th className="num">Waiting</th>
                  <th>Stage &amp; next step</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((enquiry) => {
                  const waited = daysSince(enquiry.createdAt, today);
                  return (
                    <tr key={enquiry.id}>
                      <td>
                        <strong>{enquiry.name}</strong>
                        {enquiry.phone && (
                          <div className="slot-detail">{enquiry.phone}</div>
                        )}
                        {enquiry.email && (
                          <div className="slot-detail">{enquiry.email}</div>
                        )}
                      </td>
                      <td style={{ color: "var(--ink-soft)" }}>
                        {enquiry.referralSource || "—"}
                        <div className="slot-detail">
                          {formatDateShort(enquiry.createdAt)}
                        </div>
                      </td>
                      <td className="num">
                        {/* Amber past a week: an unanswered enquiry is a lost
                            client, and a fortnight is usually terminal. */}
                        <span
                          className={
                            waited >= 7 ? "badge badge-owed" : "badge"
                          }
                        >
                          {waited === 0 ? "today" : `${waited}d`}
                        </span>
                      </td>
                      <td>
                        <form
                          action={moveStage.bind(null, enquiry.id)}
                          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                        >
                          <select
                            name="stage"
                            defaultValue={enquiry.stage}
                            aria-label={`Stage for ${enquiry.name}`}
                          >
                            {OPEN_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {STAGE_LABELS[stage]}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-secondary btn-small" type="submit">
                            Update
                          </button>
                        </form>
                        <div className="slot-detail" style={{ marginTop: "0.35rem" }}>
                          Next: {STAGE_NEXT_ACTION[enquiry.stage as Stage]}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="callout" style={{ marginTop: "1.5rem" }}>
        <h2>Not automated yet</h2>
        <p>
          Adding an enquiry already creates the task to reply to it. The rest of
          the chain — confirmation email, intake forms, forms attaching
          themselves to the client record, converting to a client — needs the
          Documents area and working email before it can be joined up.
        </p>
      </div>
    </>
  );
}
