"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { PaymentFormState } from "@/app/admin/(protected)/payments/actions";
import type { Outstanding } from "@/lib/payments";

export default function PaymentForm({
  action,
  clients,
  outstanding,
  defaultClientId,
  defaultAppointmentId,
  defaultAmount,
}: {
  action: (
    prev: PaymentFormState,
    formData: FormData,
  ) => Promise<PaymentFormState>;
  clients: Array<{ id: number; fullName: string }>;
  outstanding: Outstanding[];
  defaultClientId?: number;
  defaultAppointmentId?: number;
  defaultAmount?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    action,
    {},
  );

  const [clientId, setClientId] = useState(String(defaultClientId ?? ""));
  const [amount, setAmount] = useState(defaultAmount ?? "");
  const today = new Date().toISOString().slice(0, 10);

  // Only offer unpaid appointments belonging to the chosen client.
  const clientOutstanding = outstanding.filter(
    (row) => String(row.clientId) === clientId,
  );

  return (
    <form action={formAction} className="form form-wide">
      <fieldset className="fieldset">
        <legend>Payment</legend>

        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="clientId">Client</label>
            <select
              id="clientId"
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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
            <label htmlFor="amount">Amount (£)</label>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="45.00"
              required
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="appointmentId">Against which appointment?</label>
          <select
            id="appointmentId"
            name="appointmentId"
            defaultValue={defaultAppointmentId ?? ""}
          >
            <option value="">Not linked to an appointment</option>
            {clientOutstanding.map((row) => (
              <option key={row.appointmentId} value={row.appointmentId}>
                {row.startsAt.slice(0, 10)} · {row.treatment} · £
                {(row.owedPence / 100).toFixed(2)} owed
              </option>
            ))}
          </select>
          <p className="form-note">
            Linking it clears the outstanding balance on that appointment.
          </p>
        </div>

        <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
          <div className="field">
            <label htmlFor="method">How they paid</label>
            <select id="method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Bank transfer</option>
              <option value="voucher">Voucher</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="paidAt">Date</label>
            <input id="paidAt" name="paidAt" type="date" defaultValue={today} />
          </div>
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="note">Note (optional)</label>
          <input id="note" name="note" placeholder="Paid for two sessions" />
        </div>
      </fieldset>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record payment"}
        </button>
        <Link className="btn btn-secondary" href="/admin/payments">
          Cancel
        </Link>
      </div>
    </form>
  );
}
