"use client";

import { useActionState, useState } from "react";
import {
  addEnquiry,
  type EnquiryFormState,
} from "@/app/admin/(protected)/enquiries/actions";
import { REFERRAL_SOURCES } from "@/lib/pipeline";

export default function EnquiryComposer() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<EnquiryFormState, FormData>(
    addEnquiry,
    {},
  );

  if (!open) {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          className="btn btn-primary btn-small"
          type="button"
          onClick={() => setOpen(true)}
        >
          Log an enquiry
        </button>
        {state.success && (
          <span style={{ marginLeft: "0.85rem", color: "var(--ink-soft)" }}>
            {state.success}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="panel" style={{ marginBottom: "1.5rem" }}>
      <div className="field-row field-row-2">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="referralSource">How did they find you?</label>
          <select id="referralSource" name="referralSource" defaultValue="">
            <option value="">Not sure</option>
            {REFERRAL_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" />
        </div>
      </div>

      <div className="field" style={{ marginTop: "1.15rem" }}>
        <label htmlFor="about">What are they looking for?</label>
        <textarea id="about" name="about" rows={3} />
        <p className="form-note">
          Encrypted, like the rest of the clinical record. Enough to triage —
          the detail belongs in the assessment.
        </p>
      </div>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary btn-small" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add enquiry"}
        </button>
        <button
          className="btn btn-secondary btn-small"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
