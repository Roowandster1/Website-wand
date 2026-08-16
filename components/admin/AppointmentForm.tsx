"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AppointmentFormState } from "@/app/admin/(protected)/diary/actions";
import type { Appointment } from "@/lib/appointments";

type TreatmentOption = { name: string; duration: number; pricePence: number };

export default function AppointmentForm({
  action,
  appointment,
  clients,
  treatments,
  defaultClientId,
  submitLabel,
}: {
  action: (
    prev: AppointmentFormState,
    formData: FormData,
  ) => Promise<AppointmentFormState>;
  appointment?: Appointment;
  clients: Array<{ id: number; fullName: string }>;
  treatments: TreatmentOption[];
  defaultClientId?: number;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    AppointmentFormState,
    FormData
  >(action, {});

  const [duration, setDuration] = useState(
    appointment?.durationMins ?? treatments[0]?.duration ?? 60,
  );
  const [price, setPrice] = useState(
    appointment ? (appointment.pricePence / 100).toFixed(2) : "",
  );

  // Picking a treatment fills in its usual length and fee, but both stay
  // editable — a session that ran long shouldn't need fighting with.
  function onTreatmentChange(name: string) {
    const match = treatments.find((t) => t.name === name);
    if (!match) return;
    setDuration(match.duration);
    setPrice((match.pricePence / 100).toFixed(2));
  }

  return (
    <form action={formAction} className="form form-wide">
      <fieldset className="fieldset">
        <legend>Appointment</legend>

        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="clientId">Client</label>
            <select
              id="clientId"
              name="clientId"
              defaultValue={appointment?.clientId ?? defaultClientId ?? ""}
              required
            >
              <option value="" disabled>
                Choose a client…
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="treatment">Treatment</label>
            <select
              id="treatment"
              name="treatment"
              defaultValue={appointment?.treatment ?? ""}
              onChange={(e) => onTreatmentChange(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose a treatment…
              </option>
              {treatments.map((treatment) => (
                <option key={treatment.name} value={treatment.name}>
                  {treatment.name}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="field-row field-row-3" style={{ marginTop: "1.15rem" }}>
          <div className="field">
            <label htmlFor="startsAt">Date and time</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={
                appointment ? appointment.startsAt.slice(0, 16).replace(" ", "T") : ""
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="durationMins">Length (minutes)</label>
            <input
              id="durationMins"
              name="durationMins"
              type="number"
              min={5}
              max={600}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="price">Fee (£)</label>
            <input
              id="price"
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="45.00"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: "1.15rem", maxWidth: "16rem" }}>
          <label htmlFor="status">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={appointment?.status ?? "booked"}
          >
            <option value="booked">Booked</option>
            <option value="attended">Attended</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">Didn&rsquo;t turn up</option>
          </select>
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="notes">Notes about the booking</label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={appointment?.notes}
            placeholder="Running late last time, wants the same room…"
          />
          <p className="form-note">Encrypted, same as the clinical record.</p>
        </div>
      </fieldset>

      {state.error && (
        <>
          <p className="form-status" data-tone="error" role="alert">
            {state.error}
          </p>
          <label className="checkbox">
            <input type="checkbox" name="allowClash" />
            <span>Book anyway, I know it overlaps</span>
          </label>
        </>
      )}

      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link className="btn btn-secondary" href="/admin/diary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
