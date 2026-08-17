"use client";

import { useState } from "react";

/**
 * Adding a treatment note. Deliberately sits at the top of the record so it is
 * the first thing available after a session, when she actually writes it up.
 */
export default function NoteForm({
  action,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  // Controlled on purpose. React clears a form once its action returns, so an
  // uncontrolled textarea would lose a written-up session the moment anything
  // goes wrong — which is exactly when you least want to retype it.
  const [body, setBody] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={async (formData) => {
        const result = await action(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setBody("");
      }}
      className="form form-wide"
    >
      <div className="field">
        <label htmlFor="body">Add a note</label>
        <textarea
          id="body"
          name="body"
          rows={4}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What you did this session, how they responded, anything to pick up next time."
        />
      </div>

      {error && (
        <p className="form-status" data-tone="error" role="alert">
          {error}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div className="field" style={{ flex: "0 0 auto" }}>
          <label htmlFor="recordedAt">Date</label>
          <input
            id="recordedAt"
            name="recordedAt"
            type="date"
            defaultValue={today}
          />
        </div>
        <button className="btn btn-primary btn-small" type="submit">
          Save note
        </button>
      </div>
    </form>
  );
}
