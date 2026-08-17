"use client";

import { useState } from "react";
import type { Tag } from "@/lib/client-lifecycle";

/**
 * Tags on a client record.
 *
 * Split into two groups, with the sensitive ones second and marked. The split
 * isn't decoration: "Online" is logistics, "ADHD" is health data under UK GDPR,
 * and a single flat list of checkboxes invites treating them the same. Showing
 * plainly which is which is the cheapest thing that keeps the distinction in
 * whoever's mind is clicking.
 *
 * The sensitive group starts collapsed, so a diagnosis isn't sitting on screen
 * in a room where somebody could be reading over a shoulder.
 */
export default function TagPicker({
  tags,
  selected,
  action,
}: {
  tags: Tag[];
  selected: number[];
  action: (formData: FormData) => void;
}) {
  const [showSensitive, setShowSensitive] = useState(false);
  const [chosen, setChosen] = useState<number[]>(selected);

  const plain = tags.filter((tag) => !tag.isSensitive);
  const sensitive = tags.filter((tag) => tag.isSensitive);
  const sensitiveChosen = sensitive.filter((tag) => chosen.includes(tag.id));

  const toggle = (id: number) =>
    setChosen((was) =>
      was.includes(id) ? was.filter((v) => v !== id) : [...was, id],
    );

  const dirty =
    chosen.length !== selected.length ||
    chosen.some((id) => !selected.includes(id));

  const checkbox = (tag: Tag) => (
    <label className="tag-check" key={tag.id}>
      <input
        type="checkbox"
        name="tag"
        value={tag.id}
        checked={chosen.includes(tag.id)}
        onChange={() => toggle(tag.id)}
      />
      {tag.label}
    </label>
  );

  return (
    <form action={action}>
      <div className="tag-group">{plain.map(checkbox)}</div>

      <div className="tag-sensitive">
        <button
          type="button"
          className="tag-reveal"
          aria-expanded={showSensitive}
          onClick={() => setShowSensitive((was) => !was)}
        >
          {showSensitive ? "Hide" : "Show"} health tags
          {!showSensitive && sensitiveChosen.length > 0
            ? ` (${sensitiveChosen.length} applied)`
            : ""}
        </button>

        {showSensitive && (
          <>
            <p className="fieldset-note">
              These describe someone&rsquo;s health, so they are special category
              data. They stay on the record and in the backup, but they are kept
              out of the audit log and out of every email.
            </p>
            <div className="tag-group">{sensitive.map(checkbox)}</div>
          </>
        )}

        {/* Hidden inputs keep the sensitive selections in the submission even
            while the group is collapsed — otherwise saving with it closed would
            silently strip every health tag off the record. */}
        {!showSensitive &&
          sensitiveChosen.map((tag) => (
            <input key={tag.id} type="hidden" name="tag" value={tag.id} />
          ))}
      </div>

      <button
        className="btn btn-secondary btn-small"
        type="submit"
        disabled={!dirty}
        style={{ marginTop: "1rem" }}
      >
        {dirty ? "Save tags" : "Saved"}
      </button>
    </form>
  );
}
