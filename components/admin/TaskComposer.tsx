"use client";

import { useActionState, useState } from "react";
import { addTask, type TaskFormState } from "@/app/admin/(protected)/tasks/actions";
import type { Role } from "@/lib/team";

/**
 * Adding a task. Collapsed to a single line until opened, because the list is
 * the point of the page and a permanent six-field form pushes it below the fold.
 */
export default function TaskComposer({
  staff,
  clients,
  defaultClientId,
}: {
  staff: Array<{ id: number; name: string; role: Role }>;
  clients: Array<{ id: number; fullName: string }>;
  defaultClientId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(
    addTask,
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
          Add a task
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
      <div className="field">
        <label htmlFor="title">What needs doing?</label>
        <input id="title" name="title" required autoFocus maxLength={200} />
      </div>

      <div className="field-row field-row-3" style={{ marginTop: "1.15rem" }}>
        <div className="field">
          <label htmlFor="dueOn">Due</label>
          <input id="dueOn" name="dueOn" type="date" />
        </div>
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue="normal">
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="assigneeId">Who</label>
          <select id="assigneeId" name="assigneeId" defaultValue="">
            <option value="">Unassigned</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row field-row-2" style={{ marginTop: "1.15rem" }}>
        <div className="field">
          <label htmlFor="clientId">About a client (optional)</label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={defaultClientId ? String(defaultClientId) : ""}
          >
            <option value="">Not about anyone in particular</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="repeatEvery">Repeat</label>
          <select id="repeatEvery" name="repeatEvery" defaultValue="none">
            <option value="none">Just once</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="fortnightly">Every fortnight</option>
            <option value="monthly">Every 4 weeks</option>
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: "1.15rem" }}>
        <label htmlFor="detail">Any detail (optional)</label>
        <textarea id="detail" name="detail" rows={2} />
        <p className="form-note">
          Keep clinical detail in the client&rsquo;s record rather than here —
          task titles are stored unencrypted so they can be listed and searched.
        </p>
      </div>

      {state.error && (
        <p className="form-status" data-tone="error" role="alert">
          {state.error}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary btn-small" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add task"}
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
