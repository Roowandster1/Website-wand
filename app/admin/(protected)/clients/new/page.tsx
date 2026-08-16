import type { Metadata } from "next";
import Link from "next/link";
import { saveNewClient } from "../actions";
import ClientForm from "@/components/admin/ClientForm";

export const metadata: Metadata = { title: "Add a client" };
export const dynamic = "force-dynamic";

export default function NewClientPage() {
  return (
    <>
      <p className="breadcrumb">
        <Link href="/admin/clients">Clients</Link> / Add
      </p>
      <div className="admin-head">
        <div>
          <h1>Add a client</h1>
          <p>Only the name is required — the rest can be filled in later.</p>
        </div>
      </div>

      <ClientForm action={saveNewClient} submitLabel="Save client" />
    </>
  );
}
