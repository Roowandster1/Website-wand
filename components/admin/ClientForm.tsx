"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ClientFormState } from "@/app/admin/(protected)/clients/actions";
import type { Client } from "@/lib/clients";

export default function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (
    prev: ClientFormState,
    formData: FormData,
  ) => Promise<ClientFormState>;
  client?: Client;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="form form-wide">
      <fieldset className="fieldset">
        <legend>Who they are</legend>

        <div className="field-row field-row-2">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              name="firstName"
              defaultValue={client?.firstName}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              name="lastName"
              defaultValue={client?.lastName}
              required
            />
          </div>
        </div>

        <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={client?.phone}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={client?.email}
            />
          </div>
        </div>

        <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={client?.dateOfBirth}
            />
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              name="address"
              defaultValue={client?.address}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Health information</legend>
        <p className="fieldset-note">
          Everything in this section is encrypted before it is saved, so it
          can&rsquo;t be read straight off the disk. Record what you need in
          order to treat someone safely — and no more than that.
        </p>

        <div className="field">
          <label htmlFor="healthConditions">
            Conditions, injuries or recent surgery
          </label>
          <textarea
            id="healthConditions"
            name="healthConditions"
            defaultValue={client?.healthConditions}
            rows={3}
          />
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="medications">Medication</label>
          <textarea
            id="medications"
            name="medications"
            defaultValue={client?.medications}
            rows={2}
          />
        </div>

        <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
          <div className="field">
            <label htmlFor="allergies">Allergies</label>
            <textarea
              id="allergies"
              name="allergies"
              defaultValue={client?.allergies}
              rows={2}
              placeholder="Nut oils, lavender, latex…"
            />
          </div>
          <div className="field">
            <label htmlFor="contraindications">Anything to avoid</label>
            <textarea
              id="contraindications"
              name="contraindications"
              defaultValue={client?.contraindications}
              rows={2}
              placeholder="No deep pressure on lower back, avoid left ankle…"
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="gpDetails">GP name and surgery</label>
          <input id="gpDetails" name="gpDetails" defaultValue={client?.gpDetails} />
        </div>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="notes">General notes</label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={client?.notes}
            rows={3}
            placeholder="Prefers the room warm, comes in on a Wednesday…"
          />
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Consent</legend>
        <p className="fieldset-note">
          Health data needs a lawful basis under UK GDPR. Record that they
          agreed to you keeping these notes, and when.
        </p>

        <label className="checkbox">
          <input
            type="checkbox"
            name="consentGiven"
            defaultChecked={Boolean(client?.consentGivenAt)}
          />
          <span>
            They have consented to their health information being recorded and
            kept
          </span>
        </label>

        <div className="field" style={{ marginTop: "1.15rem" }}>
          <label htmlFor="consentNotes">How consent was given</label>
          <input
            id="consentNotes"
            name="consentNotes"
            defaultValue={client?.consentNotes}
            placeholder="Signed paper form at first visit, filed in the cabinet"
          />
        </div>

        {client?.consentGivenAt && (
          <p className="form-note" style={{ marginTop: "0.75rem" }}>
            First recorded {client.consentGivenAt.slice(0, 10)}.
          </p>
        )}
      </fieldset>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          className="btn btn-secondary"
          href={client ? `/admin/clients/${client.id}` : "/admin/clients"}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
