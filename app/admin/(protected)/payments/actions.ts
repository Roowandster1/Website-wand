"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/admin/actions";
import { logAudit } from "@/lib/audit";
import { nowSql } from "@/lib/dates";
import { createPayment, deletePayment, parseMoney } from "@/lib/payments";

export type PaymentFormState = { error?: string };

export async function savePayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const user = await requireUser();

  const clientId = Number(formData.get("clientId"));
  if (!clientId) return { error: "Please choose a client." };

  const amountPence = parseMoney(String(formData.get("amount") ?? ""));
  if (amountPence === null || amountPence <= 0) {
    return { error: "Please give an amount, like 45 or 45.50." };
  }

  const paidAtInput = String(formData.get("paidAt") ?? "").trim();
  if (paidAtInput && !/^\d{4}-\d{2}-\d{2}$/.test(paidAtInput)) {
    return { error: "Please give a valid date." };
  }

  const appointmentRaw = String(formData.get("appointmentId") ?? "");
  const appointmentId = appointmentRaw ? Number(appointmentRaw) : null;

  const id = createPayment({
    clientId,
    appointmentId,
    amountPence,
    method: String(formData.get("method") ?? "cash"),
    paidAt: paidAtInput ? `${paidAtInput} 12:00:00` : nowSql(),
    note: String(formData.get("note") ?? "").trim(),
  });

  await logAudit("payment.created", {
    userId: user.id,
    entity: "payment",
    entityId: id,
    detail: `client ${clientId}`,
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  redirect("/admin/payments");
}

export async function removePayment(paymentId: number) {
  const user = await requireUser();
  deletePayment(paymentId);
  await logAudit("payment.deleted", {
    userId: user.id,
    entity: "payment",
    entityId: paymentId,
  });
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
}
