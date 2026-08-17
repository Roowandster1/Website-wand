import {
  about,
  availability,
  clientGroups,
  contact,
  faqs,
  fees,
  qualifications,
  site,
} from "@/content/site";

/**
 * Structured data (schema.org, as JSON-LD) for the home page.
 *
 * This is what lets a search engine show the practice properly in a local
 * result — the areas she covers, the fee, how to ring her — rather than
 * scraping a guess out of the page text. For somebody searching "counsellor
 * near me" that difference is most of the value the site has.
 *
 * Two rules followed strictly here:
 *
 * 1. Nothing is claimed that isn't already visible on the page. Structured data
 *    that contradicts the page is treated as spam, and more importantly it would
 *    be a lie about a health professional.
 * 2. The type is `ProfessionalService`, not `Psychologist` or `Physician`. She is
 *    an accredited counsellor, and the medical types would overstate that. There
 *    is no schema.org type for counselling, and the honest general one is better
 *    than a flattering wrong one.
 *
 * No `aggregateRating` and no `review`: there are no reviews, and inventing them
 * for a counsellor would be indefensible as well as against Google's rules.
 */
export default function StructuredData() {
  const url = site.url.replace(/\/$/, "");

  const practice = {
    "@type": "ProfessionalService",
    "@id": `${url}/#practice`,
    name: site.name,
    description: site.description,
    url: `${url}/`,
    telephone: contact.phoneLink,
    email: contact.email,
    image: `${url}/og.jpg`,
    priceRange: fees.amount,
    currenciesAccepted: "GBP",
    // Only the districts she publishes. There is deliberately no street address
    // here, because she doesn't publish one.
    areaServed: contact.locations.map((name) => ({
      "@type": "Place",
      name,
    })),
    address: {
      "@type": "PostalAddress",
      addressLocality: "London",
      addressCountry: "GB",
    },
    availableLanguage: "en-GB",
    knowsAbout: [
      "Counselling",
      "Person-centred therapy",
      "ADHD",
      "Autism",
      "Bereavement",
      "Anxiety",
      "Depression",
      "Trauma",
    ],
    audience: clientGroups.map((name) => ({
      "@type": "Audience",
      audienceType: name,
    })),
    provider: { "@id": `${url}/#elizabeth` },
  };

  const person = {
    "@type": "Person",
    "@id": `${url}/#elizabeth`,
    name: site.name,
    jobTitle: site.role,
    description: about.intro,
    telephone: contact.phoneLink,
    url: `${url}/about/`,
    ...(about.portrait ? { image: `${url}${about.portrait}` } : {}),
    memberOf: qualifications.memberships.map((membership) => ({
      "@type": "Organization",
      name: membership.name,
      alternateName: "BACP",
      url: "https://www.bacp.co.uk/",
    })),
    knowsLanguage: "en-GB",
    worksFor: { "@id": `${url}/#practice` },
  };

  /* The FAQ answers already read from `fees`, `sessionTypes` and the rest, so
     this can never drift from what the page shows. */
  const faqPage = {
    "@type": "FAQPage",
    "@id": `${url}/#faq`,
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer.join(" "),
      },
    })),
  };

  const graph: Record<string, unknown>[] = [practice, person, faqPage];

  /* Said in the markup as well as on the page: someone searching should not have
     to open the site to find out there is a wait. */
  if (!availability.open) {
    graph.push({
      "@type": "Statement",
      "@id": `${url}/#availability`,
      about: { "@id": `${url}/#practice` },
      text: availability.waitingListMessage,
    });
  }

  const payload = { "@context": "https://schema.org", "@graph": graph };

  return (
    <script
      type="application/ld+json"
      // Not user input — every value comes from content/site.ts — and JSON.stringify
      // escapes the quotes. The only sequence that could break out of a script
      // element is "</", so that is neutralised explicitly.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
      }}
    />
  );
}
