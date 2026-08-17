/**
 * The enquiry pipeline's shape: stages, labels, next actions, referral sources.
 *
 * Deliberately free of `server-only`, the database and the crypto layer, so a
 * client component can import these lists without dragging the native SQLite
 * driver into the browser bundle. `lib/enquiries.ts` re-exports them, and holds
 * everything that actually touches data.
 */

export const STAGES = [
  "new",
  "contacted",
  "consultation",
  "assigned",
  "waitlist",
  "converted",
  "closed",
] as const;
export type Stage = (typeof STAGES)[number];

/** Stages still in play — a pipeline view should not list the exits. */
export const OPEN_STAGES = STAGES.filter(
  (s) => s !== "converted" && s !== "closed",
);

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New enquiry",
  contacted: "Contacted",
  consultation: "Consultation booked",
  assigned: "Therapist assigned",
  waitlist: "Waiting list",
  converted: "Became a client",
  closed: "Closed",
};

/** The one thing to do next at each stage. */
export const STAGE_NEXT_ACTION: Record<Stage, string> = {
  new: "Reply and acknowledge the enquiry",
  contacted: "Book a consultation, or add to the waiting list",
  consultation: "Hold the consultation, then assign a therapist",
  assigned: "Send intake forms and convert to a client",
  waitlist: "Review when capacity frees up",
  converted: "Nothing — this is now a client record",
  closed: "Nothing",
};

export const REFERRAL_SOURCES = [
  "Self-referral",
  "GP",
  "School",
  "Psychiatrist",
  "Recommendation",
  "Google",
  "Website enquiry form",
  "Other",
] as const;
