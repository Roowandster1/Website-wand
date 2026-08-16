"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/admin/actions";
import {
  cancelFutureInSeries,
  createAppointment,
  createSeries,
  deleteAppointment,
  findClashes,
  REPEAT_INTERVALS,
  updateAppointment,
  type AppointmentInput,
  type RepeatEvery,
} from "@/lib/appointments";
import { logAudit } from "@/lib/audit";
import { formatTime, inputToSql } from "@/lib/dates";
import { parseMoney } from "@/lib/payments";

export type AppointmentFormState = { error?: string; warning?: string };

function readForm(
  formData: FormData,
): { input: AppointmentInput } | { error: string } {
  const clientId = Number(formData.get("clientId"));
  if (!clientId) return { error: "Please choose a client." };

  const treatment = String(formData.get("treatment") ?? "").trim();
  if (!treatment) return { error: "Please choose a treatment." };

  const startsAt = inputToSql(String(formData.get("startsAt") ?? ""));
  if (!startsAt) return { error: "Please give a valid date and time." };

  const durationMins = Number(formData.get("durationMins"));
  if (!Number.isInteger(durationMins) || durationMins <= 0 || durationMins > 600) {
    return { error: "Please give a sensible length in minutes." };
  }

  const pricePence = parseMoney(String(formData.get("price") ?? "0"));
  if (pricePence === null) {
    return { error: "Please give the fee as a number, like 45 or 45.50." };
  }

  const status = String(formData.get("status") ?? "booked") as
    | AppointmentInput["status"];

  return {
    input: {
      clientId,
      treatment,
      startsAt,
      durationMins,
      pricePence,
      status,
      notes: String(formData.get("notes") ?? "").trim(),
    },
  };
}

export async function saveNewAppointment(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const user = await requireUser();
  const parsed = readForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { input } = parsed;
  const allowClash = formData.get("allowClash") === "on";

  // Double-booking is worth blocking outright rather than warning about — it
  // is nearly always a mistake, and she is one person who can't be in two
  // places at once.
  const clashes = findClashes(input.startsAt, input.durationMins);
  if (clashes.length > 0 && !allowClash) {
    const clash = clashes[0];
    return {
      error: `That overlaps with ${clash.clientName} at ${formatTime(
        clash.startsAt,
      )}. Tick "book anyway" below if you meant to.`,
    };
  }

  const repeatEvery = String(formData.get("repeatEvery") ?? "");
  const occurrences = Number(formData.get("occurrences") ?? 1);

  if (repeatEvery && repeatEvery !== "none") {
    if (!(repeatEvery in REPEAT_INTERVALS)) {
      return { error: "That repeat option isn't one I recognise." };
    }
    if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 52) {
      return { error: "Choose between 2 and 52 appointments in the series." };
    }

    const result = createSeries(
      input,
      repeatEvery as RepeatEvery,
      occurrences,
      allowClash,
    );

    await logAudit("appointment.created", {
      userId: user.id,
      entity: "appointment_series",
      detail: `${result.created.length} booked, ${result.skipped.length} skipped`,
    });

    revalidatePath("/admin/diary");
    revalidatePath("/admin");

    // Skipped occurrences are reported rather than silently dropped, so she
    // knows which weeks still need sorting out.
    const skippedNote = result.skipped.length
      ? `&skipped=${encodeURIComponent(
          result.skipped
            .map((s) => `${s.startsAt.slice(0, 10)} (${s.clashesWith})`)
            .join(", "),
        )}`
      : "";
    redirect(
      `/admin/diary?series=${result.seriesId}&booked=${result.created.length}${skippedNote}`,
    );
  }

  const id = createAppointment(input);
  await logAudit("appointment.created", {
    userId: user.id,
    entity: "appointment",
    entityId: id,
  });

  revalidatePath("/admin/diary");
  revalidatePath("/admin");
  redirect(`/admin/diary/${id}`);
}

/** Cancels the rest of a repeating series from a given appointment onwards. */
export async function cancelRestOfSeries(
  seriesId: string,
  fromStartsAt: string,
) {
  const user = await requireUser();
  cancelFutureInSeries(seriesId, fromStartsAt);

  await logAudit("appointment.updated", {
    userId: user.id,
    entity: "appointment_series",
    detail: `cancelled remaining from ${fromStartsAt}`,
  });

  revalidatePath("/admin/diary");
  revalidatePath("/admin");
  redirect("/admin/diary");
}

export async function saveExistingAppointment(
  appointmentId: number,
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const user = await requireUser();
  const parsed = readForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { input } = parsed;

  const clashes = findClashes(input.startsAt, input.durationMins, appointmentId);
  if (clashes.length > 0 && formData.get("allowClash") !== "on") {
    const clash = clashes[0];
    return {
      error: `That overlaps with ${clash.clientName} at ${formatTime(
        clash.startsAt,
      )}. Tick "book anyway" below if you meant to.`,
    };
  }

  updateAppointment(appointmentId, input);
  await logAudit("appointment.updated", {
    userId: user.id,
    entity: "appointment",
    entityId: appointmentId,
  });

  revalidatePath("/admin/diary");
  revalidatePath("/admin");
  redirect(`/admin/diary/${appointmentId}`);
}

export async function removeAppointment(appointmentId: number) {
  const user = await requireUser();
  deleteAppointment(appointmentId);
  await logAudit("appointment.deleted", {
    userId: user.id,
    entity: "appointment",
    entityId: appointmentId,
  });
  revalidatePath("/admin/diary");
  redirect("/admin/diary");
}
