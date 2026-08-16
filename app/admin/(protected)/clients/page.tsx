import type { Metadata } from "next";
import Link from "next/link";
import { listClients } from "@/lib/clients";
import { formatDateShort } from "@/lib/dates";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const includeArchived = params.archived === "1";
  const clients = listClients(search, includeArchived);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Clients</h1>
          <p>
            {clients.length} {clients.length === 1 ? "record" : "records"}
            {search && ` matching “${search}”`}
          </p>
        </div>
        <Link className="btn btn-primary btn-small" href="/admin/clients/new">
          Add a client
        </Link>
      </div>

      <form className="toolbar" method="get">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by name, email or phone"
          aria-label="Search clients"
        />
        <label className="checkbox" style={{ alignItems: "center" }}>
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={includeArchived}
          />
          <span style={{ fontSize: "0.92rem" }}>Include archived</span>
        </label>
        <button className="btn btn-secondary btn-small" type="submit">
          Search
        </button>
        {(search || includeArchived) && (
          <Link className="btn btn-secondary btn-small" href="/admin/clients">
            Clear
          </Link>
        )}
      </form>

      <section className="panel panel-flush">
        {clients.length === 0 ? (
          <p className="empty">
            {search
              ? "Nobody matches that search."
              : "No clients yet. Add the first one to get started."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link href={`/admin/clients/${client.id}`}>
                        <strong>{client.fullName}</strong>
                      </Link>
                      {client.isArchived && (
                        <>
                          {" "}
                          <span className="badge">archived</span>
                        </>
                      )}
                    </td>
                    <td>
                      {client.phone && <div>{client.phone}</div>}
                      {client.email && (
                        <div className="slot-detail">{client.email}</div>
                      )}
                      {!client.phone && !client.email && (
                        <span style={{ color: "var(--ink-soft)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {client.lastSeen ? (
                        formatDateShort(client.lastSeen)
                      ) : (
                        <span style={{ color: "var(--ink-soft)" }}>
                          Not yet seen
                        </span>
                      )}
                    </td>
                    <td>
                      {/* Flags that cautions exist without showing what they
                          are — the list has no need to decrypt them. */}
                      {client.hasCautions && (
                        <span className="badge badge-caution">
                          Check notes
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
