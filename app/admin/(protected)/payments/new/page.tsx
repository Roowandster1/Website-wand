import type { Metadata } from "next";
import Link from "next/link";
import { savePayment } from "../actions";
import PaymentForm from "@/components/admin/PaymentForm";
import { getAppointment } from "@/lib/appointments";
import { listClients } from "@/lib/clients";
import { listOutstanding } from "@/lib/payments";

export const metadata: Metadata = { title: "Record a payment" };
export const dynamic = "force-dynamic";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  const params = await searchParams;
  const clients = listClients("", true);
  const outstanding = listOutstanding();

  // Arriving from an "owed" link pre-fills the client, appointment and the
  // exact amount still outstanding.
  const appointment = params.appointment
    ? getAppointment(Number(params.appointment))
    : null;
  const owed = appointment
    ? appointment.pricePence - appointment.paidPence
    : null;

  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/payments">Payments</Link> / Record
      </p>
      <div className="admin-head">
        <div>
          <h1>Record a payment</h1>
          {appointment && (
            <p>
              {appointment.clientName} · {appointment.treatment}
            </p>
          )}
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="callout callout-warn">
          <h2>No clients yet</h2>
          <p>
            <Link href="/admin/clients/new">Add a client</Link> before recording
            payments.
          </p>
        </div>
      ) : (
        <PaymentForm
          action={savePayment}
          clients={clients}
          outstanding={outstanding}
          defaultClientId={appointment?.clientId}
          defaultAppointmentId={appointment?.id}
          defaultAmount={owed !== null && owed > 0 ? (owed / 100).toFixed(2) : ""}
        />
      )}
    </>
  );
}
