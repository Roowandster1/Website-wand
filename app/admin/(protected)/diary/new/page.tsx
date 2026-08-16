import type { Metadata } from "next";
import Link from "next/link";
import { saveNewAppointment } from "../actions";
import AppointmentForm from "@/components/admin/AppointmentForm";
import { listClients } from "@/lib/clients";
import { treatmentOptions } from "@/lib/treatment-options";

export const metadata: Metadata = { title: "Book an appointment" };
export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;
  const clients = listClients();
  const defaultClientId = params.client ? Number(params.client) : undefined;

  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/diary">Diary</Link> / Book
      </p>
      <div className="admin-head">
        <div>
          <h1>Book an appointment</h1>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="callout callout-warn">
          <h2>No clients yet</h2>
          <p>
            You need at least one client on file before you can book anything.{" "}
            <Link href="/admin/clients/new">Add a client first</Link>.
          </p>
        </div>
      ) : (
        <AppointmentForm
          action={saveNewAppointment}
          clients={clients}
          treatments={treatmentOptions()}
          defaultClientId={defaultClientId}
          submitLabel="Book it in"
        />
      )}
    </>
  );
}
