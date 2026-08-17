import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNote,
  addTimelineEntry,
  changeStatus,
  discharge,
  removeNote,
  removeTimelineEntry,
  saveTags,
  setArchived,
} from "../actions";
import NoteForm from "@/components/admin/NoteForm";
import TagPicker from "@/components/admin/TagPicker";
import TimelineForm from "@/components/admin/TimelineForm";
import { requireUser } from "@/app/admin/actions";
import { listAppointmentsForClient } from "@/lib/appointments";
import { logAudit } from "@/lib/audit";
import {
  clientLifecycle,
  clientTags,
  listClientEvents,
  listTags,
  missingInformation,
  nextAction,
} from "@/lib/client-lifecycle";
import {
  CLIENT_STATUSES,
  STATUS_HINTS,
  STATUS_LABELS,
} from "@/lib/client-status";
import { getClient, listNotes } from "@/lib/clients";
import {
  ageFrom,
  formatDate,
  formatDateShort,
  formatTime,
  todaySql,
} from "@/lib/dates";
import { formatMoney } from "@/lib/payments";

export const metadata: Metadata = { title: "Client record" };
export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const clientId = Number(id);
  const client = getClient(clientId);
  if (!client) notFound();

  // Opening a health record is itself an event worth recording — this is what
  // lets her answer "who has seen my notes?" truthfully.
  await logAudit("client.viewed", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
  });

  const notes = listNotes(clientId);
  const appointments = listAppointmentsForClient(clientId);
  const age = client.dateOfBirth ? ageFrom(client.dateOfBirth) : null;

  const lifecycle = clientLifecycle(clientId);
  const events = listClientEvents(clientId);
  const tags = listTags();
  const applied = clientTags(clientId);
  const gaps = missingInformation(client);
  const todo = nextAction(client);

  const cautions = [
    client.allergies && { label: "Allergies", value: client.allergies },
    client.contraindications && {
      label: "Avoid",
      value: client.contraindications,
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const archiveAction = setArchived.bind(null, clientId, !client.isArchived);
  const statusAction = changeStatus.bind(null, clientId);
  const dischargeAction = discharge.bind(null, clientId);
  const tagsAction = saveTags.bind(null, clientId);
  const timelineAction = addTimelineEntry.bind(null, clientId);

  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/clients">Clients</Link> / {client.fullName}
      </p>

      <div className="admin-head">
        <div>
          <h1>{client.fullName}</h1>
          <p>
            {[client.phone, client.email, age !== null && `${age} years old`]
              .filter(Boolean)
              .join(" · ") || "No contact details recorded"}
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link
            className="btn btn-secondary btn-small"
            href={`/admin/diary/new?client=${clientId}`}
          >
            Book appointment
          </Link>
          <Link
            className="btn btn-primary btn-small"
            href={`/admin/clients/${clientId}/edit`}
          >
            Edit record
          </Link>
        </div>
      </div>

      {/* What this person needs next, worked out from the record rather than
          typed in by hand — so it is still true a week later. */}
      {todo && (
        <div className={`next-action next-action-${todo.tone}`}>
          <p className="next-action-label">Next</p>
          <div>
            <p className="next-action-title">
              {todo.href ? (
                <Link href={todo.href}>{todo.label}</Link>
              ) : (
                todo.label
              )}
            </p>
            <p className="next-action-detail">{todo.detail}</p>
          </div>
        </div>
      )}

      {client.isArchived && (
        <div className="callout callout-warn">
          <h2>This record is archived</h2>
          <p>
            It stays on file so the clinical history is preserved, but it is
            hidden from the main client list.
          </p>
        </div>
      )}

      {cautions.length > 0 && (
        <div className="callout callout-warn">
          <h2>Before treating</h2>
          {cautions.map((caution) => (
            <p key={caution.label}>
              <strong>{caution.label}:</strong> {caution.value}
            </p>
          ))}
        </div>
      )}

      <div className="admin-grid admin-grid-2">
        <div>
          <section className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2>Treatment notes</h2>
            <NoteForm action={addNote.bind(null, clientId)} />

            {notes.length === 0 ? (
              <p style={{ color: "var(--ink-soft)", marginTop: "1.5rem" }}>
                No notes recorded yet.
              </p>
            ) : (
              <div style={{ marginTop: "0.5rem" }}>
                {notes.map((note) => (
                  <article className="note-entry" key={note.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                      }}
                    >
                      <p className="note-date">{formatDate(note.recordedAt)}</p>
                      <form action={removeNote.bind(null, clientId, note.id)}>
                        <button
                          className="link-button"
                          type="submit"
                          style={{
                            color: "var(--ink-soft)",
                            fontSize: "0.82rem",
                          }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                    <p className="note-body">{note.body}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2>Timeline</h2>
            <TimelineForm action={timelineAction} today={todaySql()} />

            {events.length === 0 ? (
              <p
                style={{
                  color: "var(--ink-soft)",
                  marginTop: "1.5rem",
                }}
              >
                Nothing on the timeline yet. Status changes add themselves.
              </p>
            ) : (
              <ol className="timeline">
                {events.map((event) => (
                  <li key={event.id}>
                    <div className="timeline-head">
                      <span className="timeline-kind">{event.label}</span>
                      <span className="timeline-when">
                        {formatDate(event.occurredAt, false)}
                      </span>
                    </div>
                    {event.detail && <p>{event.detail}</p>}
                    <div className="timeline-foot">
                      {event.createdBy && <span>{event.createdBy}</span>}
                      <form
                        action={removeTimelineEntry.bind(
                          null,
                          clientId,
                          event.id,
                        )}
                      >
                        <button className="link-button" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div>
          <section className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2>Health information</h2>

            {client.healthConditions && (
              <div className="clinical">
                <h3>Conditions</h3>
                <p>{client.healthConditions}</p>
              </div>
            )}
            {client.medications && (
              <div className="clinical">
                <h3>Medication</h3>
                <p>{client.medications}</p>
              </div>
            )}
            {client.gpDetails && (
              <div className="clinical">
                <h3>GP</h3>
                <p>{client.gpDetails}</p>
              </div>
            )}
            {client.notes && (
              <div className="clinical">
                <h3>General notes</h3>
                <p>{client.notes}</p>
              </div>
            )}

            {!client.healthConditions &&
              !client.medications &&
              !client.gpDetails &&
              !client.notes && (
                <p style={{ color: "var(--ink-soft)", margin: 0 }}>
                  Nothing recorded yet.
                </p>
              )}

            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--ink-soft)",
                marginTop: "1rem",
                marginBottom: 0,
              }}
            >
              {client.consentGivenAt
                ? `Consent recorded ${client.consentGivenAt.slice(0, 10)}${
                    client.consentNotes ? ` — ${client.consentNotes}` : ""
                  }`
                : "⚠ No consent recorded for keeping health data."}
            </p>
          </section>

          {gaps.length > 0 && (
            <section className="panel" style={{ marginBottom: "1.5rem" }}>
              <h2>Not on file yet</h2>
              <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
                Not a checklist to clear for its own sake — each line says what
                the gap would actually cost.
              </p>
              <ul className="gap-list">
                {gaps.map((gap) => (
                  <li key={gap.label}>
                    <strong>{gap.label}</strong>
                    <span>{gap.why}</span>
                  </li>
                ))}
              </ul>
              <Link
                className="btn btn-secondary btn-small"
                href={`/admin/clients/${clientId}/edit`}
              >
                Fill these in
              </Link>
            </section>
          )}

          <section
            className="panel panel-flush"
            style={{ marginBottom: "1.5rem" }}
          >
            <h2>Appointment history</h2>
            {appointments.length === 0 ? (
              <p className="empty">No appointments yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Treatment</th>
                      <th className="num">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.slice(0, 12).map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <Link href={`/admin/diary/${appointment.id}`}>
                            {formatDateShort(appointment.startsAt)}
                          </Link>
                          <div className="slot-detail">
                            {formatTime(appointment.startsAt)}
                          </div>
                        </td>
                        <td>
                          {appointment.treatment}
                          <div>
                            <span
                              className={`badge badge-${appointment.status}`}
                            >
                              {appointment.status}
                            </span>
                          </div>
                        </td>
                        <td className="num">
                          {formatMoney(appointment.pricePence)}
                          {appointment.paidPence < appointment.pricePence &&
                            appointment.status === "attended" && (
                              <div>
                                <span className="badge badge-owed">
                                  {formatMoney(
                                    appointment.pricePence -
                                      appointment.paidPence,
                                  )}{" "}
                                  owed
                                </span>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2>Where they&rsquo;re up to</h2>

            <form action={statusAction} className="status-form">
              <div className="field">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  defaultValue={lifecycle.status}
                >
                  {CLIENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <p className="fieldset-note">
                  {STATUS_HINTS[lifecycle.status]}
                </p>
              </div>
              <button className="btn btn-secondary btn-small" type="submit">
                Update
              </button>
            </form>

            {lifecycle.referralSource && (
              <p className="fieldset-note" style={{ marginTop: "1rem" }}>
                Came via {lifecycle.referralSource}.
              </p>
            )}

            {lifecycle.dischargedAt && (
              <p className="fieldset-note" style={{ marginTop: "1rem" }}>
                Discharged {formatDate(lifecycle.dischargedAt, false)}.
              </p>
            )}

            {/* Discharge is deliberately separate from archiving: one says the
                therapy has finished, the other hides the record. Doing both at
                once is how notes disappear before the retention period is up. */}
            {lifecycle.status !== "discharged" && (
              <details className="discharge">
                <summary>Discharge this client</summary>
                <form action={dischargeAction} className="form">
                  <div className="field">
                    <label htmlFor="summary">Closing summary</label>
                    <textarea
                      id="summary"
                      name="summary"
                      rows={3}
                      placeholder="How the work ended. Goes on the timeline, encrypted."
                    />
                  </div>
                  <div>
                    <button
                      className="btn btn-secondary btn-small"
                      type="submit"
                    >
                      Discharge
                    </button>
                  </div>
                  <p className="fieldset-note">
                    This closes the work and dates it. The record stays in the
                    active list until you archive it separately.
                  </p>
                </form>
              </details>
            )}
          </section>

          <section className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2>Tags</h2>
            <TagPicker
              tags={tags}
              selected={applied.map((tag) => tag.id)}
              action={tagsAction}
            />
          </section>

          <section className="panel">
            <h2>Record management</h2>
            <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
              Added {formatDate(client.createdAt, false)}. Insurers typically
              require clinical notes to be kept for several years after the last
              treatment, so archiving is usually the right choice rather than
              deleting.
            </p>
            <form action={archiveAction}>
              <button className="btn btn-secondary btn-small" type="submit">
                {client.isArchived
                  ? "Restore to active list"
                  : "Archive this record"}
              </button>
            </form>
          </section>
        </div>
      </div>

      <p
        style={{
          marginTop: "2rem",
          fontSize: "0.85rem",
          color: "var(--ink-soft)",
        }}
      >
        Record last updated {formatDate(client.updatedAt, false)}. Viewed today,{" "}
        {formatDate(todaySql(), false)}, and logged.
      </p>
    </>
  );
}
