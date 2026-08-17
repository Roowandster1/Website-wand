"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/admin/actions";
import { logAudit } from "@/lib/audit";
import {
  assignTask,
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  PRIORITIES,
  REPEATS,
  type Priority,
  type Repeat,
} from "@/lib/tasks";

export type TaskFormState = { error?: string; success?: string };

function refresh() {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  revalidatePath("/admin/team");
}

export async function addTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a title." };
  if (title.length > 200) return { error: "That title is a bit long." };

  const dueOn = String(formData.get("dueOn") ?? "").trim();
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    return { error: "That due date isn't a valid date." };
  }

  const priority = String(formData.get("priority") ?? "normal");
  if (!PRIORITIES.includes(priority as Priority)) {
    return { error: "Unknown priority." };
  }

  const repeat = String(formData.get("repeatEvery") ?? "");
  if (repeat && repeat !== "none" && !(repeat in REPEATS)) {
    return { error: "Unknown repeat option." };
  }

  const assignee = String(formData.get("assigneeId") ?? "");
  const client = String(formData.get("clientId") ?? "");

  const id = createTask({
    title,
    detail: String(formData.get("detail") ?? "").trim(),
    dueOn: dueOn || null,
    priority: priority as Priority,
    assigneeId: assignee ? Number(assignee) : null,
    clientId: client ? Number(client) : null,
    repeatEvery: repeat && repeat !== "none" ? (repeat as Repeat) : null,
    createdBy: user.id,
  });

  await logAudit("client.updated", {
    userId: user.id,
    entity: "task",
    entityId: id,
    detail: "task created",
  });

  refresh();
  return { success: "Task added." };
}

export async function markDone(taskId: number) {
  await requireUser();
  completeTask(taskId);
  refresh();
}

export async function markOpen(taskId: number) {
  await requireUser();
  reopenTask(taskId);
  refresh();
}

export async function removeTask(taskId: number) {
  await requireUser();
  deleteTask(taskId);
  refresh();
}

export async function reassign(taskId: number, formData: FormData) {
  await requireUser();
  const value = String(formData.get("assigneeId") ?? "");
  assignTask(taskId, value ? Number(value) : null);
  refresh();
}
