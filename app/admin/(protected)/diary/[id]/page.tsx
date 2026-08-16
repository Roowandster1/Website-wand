import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelRestOfSeries,
  removeAppointment,
  saveExistingAppointment,
} from "../actions";
import AppointmentForm from "@/components/admin/AppointmentForm";
import { getAppointment, seriesAppointments } from "@/lib/appointments";
import { listClients } from "@/lib/clients";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/payments";
import { treatmentOptions } from "@/lib/treatment-options";

export const metadata: Metadata = { title: "Appointment" };
export const dynamic = "force-dynamic";

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = getAppointment(Number(id));
  if (!appointment) notFound();

  const clients = listClients("", true);
  // Bound server-side so the id can't be swapped through form input.
  const action = saveExistingAppointment.bind(null, appointment.id);
  const deleteAction = removeAppointment.bind(null, appointment.id);

  const series = appointment.seriesId
    ? seriesAppointments(appointment.seriesId)
    : [];
  const cancelRest = appointment.seriesId
    ? cancelRestOfSeries.bind(null, appointment.seriesId, appointment.startsAt)
    : undefined;

  const owed = appointment.pricePence - appointment.paidPence;

  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/diary">Diary</Link> / {appointment.clientName}
      </p>

      <div className="admin-head">
        <div>
          <h1>{appointment.clientName}</h1>
          <p>
            {formatDateTime(appointment.startsAt)} · {appointment.treatment}
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link
            className="btn btn-secondary btn-small"
            href={`/admin/clients/${appointment.clientId}`}
          >
            Open client record
          </Link>
        </div>
      </div>

      {appointment.status === "attended" && owed > 0 && (
        <div className="callout callout-warn">
          <h2>{formatMoney(owed)} still owed</h2>
          <p>
            {formatMoney(appointment.pricePence)} charged,{" "}
            {formatMoney(appointment.paidPence)} received.{" "}
            <Link href={`/admin/payments/new?appointment=${appointment.id}`}>
              Record a payment
            </Link>
            .
          </p>
        </div>
      )}

      {appointment.seriesId && (
        <div className="callout">
          <h2>Part of a repeating series</h2>
          <p>
            {series.length} appointments in total,{" "}
            {series.filter((a) => a.status === "booked").length} still booked.
            Changes below affect this one only.
          </p>
          <form action={cancelRest} style={{ marginTop: "0.75rem" }}>
            <button className="btn btn-secondary btn-small" type="submit">
              Cancel this and all later ones
            </button>
          </form>
        </div>
      )}

      <AppointmentForm
        action={action}
        appointment={appointment}
        clients={clients}
        treatments={treatmentOptions()}
        submitLabel="Save changes"
      />

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <h2>Remove this appointment</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)" }}>
          If it was cancelled, set the status to Cancelled instead — that keeps
          the history. Deleting removes it from the diary permanently.
        </p>
        <form action={deleteAction}>
          <button className="btn btn-secondary btn-small btn-danger" type="submit">
            Delete permanently
          </button>
        </form>
      </section>
    </>
  );
}
