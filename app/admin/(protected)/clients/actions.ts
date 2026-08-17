"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/admin/actions";
import { logAudit } from "@/lib/audit";
import { encryptionUnavailable } from "@/lib/config-status";
import {
  archiveClient,
  createClient,
  createNote,
  deleteClient,
  deleteNote,
  updateClient,
  type ClientInput,
} from "@/lib/clients";
import { isClientStatus, isEventKind } from "@/lib/client-status";
import {
  addClientEvent,
  deleteClientEvent,
  dischargeClient,
  listTags,
  setClientStatus,
  setClientTags,
} from "@/lib/client-lifecycle";

export type ClientFormState = { error?: string };

function readForm(formData: FormData): ClientInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    firstName: text("firstName"),
    lastName: text("lastName"),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: text("dateOfBirth"),
    address: text("address"),
    notes: text("notes"),
    healthConditions: text("healthConditions"),
    medications: text("medications"),
    allergies: text("allergies"),
    contraindications: text("contraindications"),
    gpDetails: text("gpDetails"),
    consentGiven: formData.get("consentGiven") === "on",
    consentNotes: text("consentNotes"),
    remindersOptedOut: formData.get("remindersOptedOut") === "on",
  };
}

/** True when the record carries anything that gets encrypted. */
function hasHealthData(input: ClientInput): boolean {
  return Boolean(
    input.healthConditions ||
      input.medications ||
      input.allergies ||
      input.contraindications ||
      input.gpDetails ||
      input.notes,
  );
}

function validate(input: ClientInput): string | null {
  if (!input.firstName || !input.lastName) {
    return "Please give both a first name and a last name.";
  }
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return "That email address doesn't look right.";
  }
  if (input.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    return "Please give the date of birth as a proper date.";
  }
  return null;
}

export async function saveNewClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireUser();
  const input = readForm(formData);

  const problem = validate(input);
  if (problem) return { error: problem };

  // Only blocks when health fields are actually filled in — a name-and-phone
  // record needs no encryption and should still save.
  if (hasHealthData(input)) {
    const blocked = encryptionUnavailable();
    if (blocked) return { error: blocked };
  }

  const id = createClient(input);
  await logAudit("client.created", {
    userId: user.id,
    entity: "client",
    entityId: id,
  });

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${id}`);
}

export async function saveExistingClient(
  clientId: number,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireUser();
  const input = readForm(formData);

  const problem = validate(input);
  if (problem) return { error: problem };

  if (hasHealthData(input)) {
    const blocked = encryptionUnavailable();
    if (blocked) return { error: blocked };
  }

  updateClient(clientId, input);
  await logAudit("client.updated", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
  });

  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}`);
}

export async function addNote(
  clientId: number,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return {};

  // A treatment note is entirely health data, so this always needs the key.
  const blocked = encryptionUnavailable();
  if (blocked) return { error: blocked };

  const recordedAt = String(formData.get("recordedAt") ?? "").trim();
  const noteId = createNote(
    clientId,
    body,
    recordedAt ? `${recordedAt} 00:00:00` : undefined,
  );

  await logAudit("note.created", {
    userId: user.id,
    entity: "treatment_note",
    entityId: noteId,
    detail: `client ${clientId}`,
  });
  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

export async function removeNote(clientId: number, noteId: number) {
  const user = await requireUser();
  deleteNote(noteId);
  await logAudit("note.deleted", {
    userId: user.id,
    entity: "treatment_note",
    entityId: noteId,
    detail: `client ${clientId}`,
  });
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function setArchived(clientId: number, archived: boolean) {
  const user = await requireUser();
  archiveClient(clientId, archived);
  await logAudit("client.archived", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
    detail: archived ? "archived" : "restored",
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}

/**
 * Permanent erasure, for honouring a UK GDPR Article 17 request once the
 * retention period allows it. Archiving is the normal path — this destroys the
 * clinical record along with the client, and cannot be undone.
 */
export async function permanentlyDeleteClient(clientId: number) {
  const user = await requireUser();
  deleteClient(clientId);
  await logAudit("client.deleted", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
    detail: "permanent erasure",
  });
  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}

/* --------------------------------------------------------------------------
   Lifecycle: status, timeline, tags.

   Each of these is audited. A change of status or a tag added to a record is a
   change to health data, and the audit log is what lets her answer honestly who
   changed what and when.
   -------------------------------------------------------------------------- */

export async function changeStatus(clientId: number, formData: FormData) {
  const user = await requireUser();
  const status = String(formData.get("status") ?? "");
  if (!isClientStatus(status)) return;

  setClientStatus(clientId, status, user.id);
  await logAudit("client.status", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
    detail: status,
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}

/** One click to finish the work, with room for a closing summary. */
export async function discharge(clientId: number, formData: FormData) {
  const user = await requireUser();
  const summary = String(formData.get("summary") ?? "");

  dischargeClient(clientId, summary, user.id);
  await logAudit("client.discharged", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}

export type EventFormState = { error?: string };

export async function addTimelineEntry(
  clientId: number,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const user = await requireUser();

  const kind = String(formData.get("kind") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();
  const occurredAt = String(formData.get("occurredAt") ?? "").trim();

  if (!isEventKind(kind)) return { error: "Please choose what kind of entry this is." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) {
    return { error: "Please give the date as a proper date." };
  }
  // Timeline detail is encrypted, so without a key it would be written in clear.
  if (detail && encryptionUnavailable()) {
    return {
      error:
        "DATA_ENCRYPTION_KEY isn't set, so this can't be stored safely. " +
        "Set it before recording anything confidential.",
    };
  }

  const id = addClientEvent({ clientId, kind, detail, occurredAt }, user.id);
  await logAudit("client.event.added", {
    userId: user.id,
    entity: "client_event",
    entityId: id,
    detail: `client ${clientId}, ${kind}`,
  });
  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

export async function removeTimelineEntry(clientId: number, eventId: number) {
  const user = await requireUser();
  deleteClientEvent(eventId);
  await logAudit("client.event.deleted", {
    userId: user.id,
    entity: "client_event",
    entityId: eventId,
    detail: `client ${clientId}`,
  });
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function saveTags(clientId: number, formData: FormData) {
  const user = await requireUser();

  const ids = formData
    .getAll("tag")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  setClientTags(clientId, ids);

  /* The audit detail records how many sensitive tags were applied, not which —
     writing "ADHD" into the audit log would put health data in a table that
     isn't encrypted, which is exactly the thing the tag sensitivity flag exists
     to prevent. */
  const sensitive = listTags().filter(
    (tag) => tag.isSensitive && ids.includes(tag.id),
  ).length;

  await logAudit("client.tags", {
    userId: user.id,
    entity: "client",
    entityId: clientId,
    detail: `${ids.length} tag(s), ${sensitive} sensitive`,
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}
