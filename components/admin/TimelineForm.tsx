"use client";

import { useActionState, useState } from "react";
import type { EventFormState } from "@/app/admin/(protected)/clients/actions";
import { EVENT_KINDS, EVENT_LABELS } from "@/lib/client-status";

/**
 * Adds one entry to a client's timeline.
 *
 * The detail box is controlled, for the same reason the treatment-note box is:
 * React clears an uncontrolled form once a server action returns, so if the
 * action refuses — no encryption key, bad date — whatever was typed would be
 * gone. Holding it in state means a refusal costs nothing.
 */
export default function TimelineForm({
  action,
  today,
}: {
  action: (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(
    action,
    {},
  );
  const [detail, setDetail] = useState("");

  return (
    <form action={formAction} className="form form-wide">
      <div className="field-row field-row-2">
        <div className="field">
          <label htmlFor="kind">What happened</label>
          <select id="kind" name="kind" defaultValue="review">
            {EVENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EVENT_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="occurredAt">When</label>
          <input
            id="occurredAt"
            name="occurredAt"
            type="date"
            defaultValue={today}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="detail">Detail (optional)</label>
        <textarea
          id="detail"
          name="detail"
          rows={2}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="A line for your own memory. Encrypted, like a treatment note."
        />
      </div>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <button
          className="btn btn-secondary btn-small"
          type="submit"
          disabled={pending}
        >
          {pending ? "Adding…" : "Add to timeline"}
        </button>
      </div>
    </form>
  );
}
