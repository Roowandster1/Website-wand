import { treatments } from "@/content/site";

/**
 * The diary offers the same treatments the public site advertises, read from
 * `content/site.ts` — so adding a treatment to the website also adds it to the
 * booking form, and the two can't drift apart.
 *
 * Those entries are written for humans ("60 or 90 minutes", "£45 / £65"), so
 * the first number in each is taken as the default. Both stay editable on the
 * form.
 */
export type TreatmentOption = {
  name: string;
  duration: number;
  pricePence: number;
};

function firstNumber(text: string, fallback: number): number {
  const match = /\d+(?:\.\d+)?/.exec(text);
  return match ? Number(match[0]) : fallback;
}

export function treatmentOptions(): TreatmentOption[] {
  return treatments.map((treatment) => ({
    name: treatment.name,
    duration: firstNumber(treatment.duration, 60),
    pricePence: Math.round(firstNumber(treatment.price, 0) * 100),
  }));
}
