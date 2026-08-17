"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/admin/actions";
import { logAudit } from "@/lib/audit";
import { encryptionUnavailable } from "@/lib/config-status";
import {
  closeEnquiry,
  createEnquiry,
  setStage,
  STAGES,
  type Stage,
} from "@/lib/enquiries";
import { createTask } from "@/lib/tasks";

export type EnquiryFormState = { error?: string; success?: string };

function refresh() {
  revalidatePath("/admin/enquiries");
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
}

export async function addEnquiry(
  _prev: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the person's name." };

  const email = String(formData.get("email") ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }

  const about = String(formData.get("about") ?? "").trim();
  if (about) {
    const blocked = encryptionUnavailable();
    if (blocked) return { error: blocked };
  }

  const id = createEnquiry({
    name,
    email,
    phone: String(formData.get("phone") ?? "").trim(),
    referralSource: String(formData.get("referralSource") ?? "").trim(),
    about,
  });

  // The first step of the new-client workflow: an enquiry always generates the
  // chore of replying to it, so nothing sits unanswered because nobody was
  // told to answer it.
  createTask({
    title: `Reply to ${name}'s enquiry`,
    dueOn: null,
    priority: "high",
    source: "workflow",
    createdBy: user.id,
  });

  await logAudit("client.created", {
    userId: user.id,
    entity: "enquiry",
    entityId: id,
    detail: "enquiry logged",
  });

  refresh();
  return { success: `${name} added, and a task created to reply.` };
}

export async function moveStage(enquiryId: number, formData: FormData) {
  const user = await requireUser();
  const stage = String(formData.get("stage") ?? "");
  if (!STAGES.includes(stage as Stage)) return;

  setStage(enquiryId, stage as Stage);
  await logAudit("client.updated", {
    userId: user.id,
    entity: "enquiry",
    entityId: enquiryId,
    detail: `moved to ${stage}`,
  });
  refresh();
}

export async function close(enquiryId: number, formData: FormData) {
  const user = await requireUser();
  closeEnquiry(enquiryId, String(formData.get("reason") ?? "").trim());
  await logAudit("client.updated", {
    userId: user.id,
    entity: "enquiry",
    entityId: enquiryId,
    detail: "closed",
  });
  refresh();
}
