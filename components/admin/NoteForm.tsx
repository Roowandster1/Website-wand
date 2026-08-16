"use client";

import { useRef } from "react";

/**
 * Adding a treatment note. Deliberately sits at the top of the record so it is
 * the first thing available after a session, when she actually writes it up.
 */
export default function NoteForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
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
          placeholder="What you did this session, how they responded, anything to pick up next time."
        />
      </div>

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
