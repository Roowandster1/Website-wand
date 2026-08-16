import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveExistingClient } from "../../actions";
import ClientForm from "@/components/admin/ClientForm";
import { getClient } from "@/lib/clients";

export const metadata: Metadata = { title: "Edit client" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = getClient(Number(id));
  if (!client) notFound();

  // Bind the id server-side so the client id is never taken from form input,
  // where it could be swapped for someone else's record.
  const action = saveExistingClient.bind(null, client.id);

  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/clients">Clients</Link> /{" "}
        <Link href={`/admin/clients/${client.id}`}>{client.fullName}</Link> / Edit
      </p>
      <div className="admin-head">
        <div>
          <h1>Edit {client.fullName}</h1>
        </div>
      </div>

      <ClientForm action={action} client={client} submitLabel="Save changes" />
    </>
  );
}
