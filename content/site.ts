/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EVERYTHING YOU CAN CHANGE ON THE WEBSITE LIVES IN THIS ONE FILE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Edit the text between the 'quote marks', save, and the site updates.
 *  You do not need to touch any other file to change words, prices or photos.
 *
 *  Anything marked  ‹‹ CHANGE ME ››  is a placeholder I invented so the site
 *  had something to show. Swap it for the real details before going live.
 */

export const site = {
  /** Business name. Shows in the header, the browser tab and the footer. */
  name: "Willow & Thyme", // ‹‹ CHANGE ME ››
  /** One line under the name. Keep it short — it sits in the header. */
  tagline: "Holistic therapies in the heart of the village", // ‹‹ CHANGE ME ››
  /** Used by Google and when the link is shared on WhatsApp or Facebook. */
  description:
    "Gentle, unhurried holistic therapy — massage, reflexology and aromatherapy — in a calm home studio. Book a treatment today.",
  /** Set this once the site has a real web address, e.g. "https://willowandthyme.co.uk" */
  url: "https://example.com", // ‹‹ CHANGE ME ››
};

export const contact = {
  email: "hello@willowandthyme.co.uk", // ‹‹ CHANGE ME ››
  /** Written how you'd say it out loud. */
  phone: "01234 567 890", // ‹‹ CHANGE ME ››
  /** Digits only, with country code — this is what a phone actually dials. */
  phoneLink: "+441234567890", // ‹‹ CHANGE ME ››
  /** Rough location is fine. Don't publish a home address you'd rather keep private. */
  location: "Home studio, Little Marlow, Buckinghamshire", // ‹‹ CHANGE ME ››
  /** Leave a link as an empty string ("") and it disappears from the site. */
  facebook: "",
  instagram: "",
  /**
   * The contact form needs somewhere to send messages. Until you set this up,
   * the form opens her email app with the message pre-written — which works
   * fine, and costs nothing.
   *
   * To get proper emailed submissions instead: make a free form at
   * https://formspree.io, then paste the URL it gives you in here.
   */
  formEndpoint: "",
};

/** The opening hours table on the contact page. */
export const hours = [
  { day: "Monday", time: "9am – 5pm" },
  { day: "Tuesday", time: "9am – 5pm" },
  { day: "Wednesday", time: "9am – 8pm" },
  { day: "Thursday", time: "9am – 5pm" },
  { day: "Friday", time: "9am – 3pm" },
  { day: "Saturday", time: "10am – 2pm" },
  { day: "Sunday", time: "Closed" },
];

/**
 * The treatments she offers.
 *
 * Add one by copying a whole { ... } block and changing the words.
 * Remove one by deleting its { ... } block. Order here = order on the page.
 */
export const treatments = [
  {
    slug: "swedish-massage",
    name: "Swedish Massage",
    duration: "60 or 90 minutes",
    price: "£45 / £65",
    summary:
      "Slow, flowing strokes to ease tired muscles and quieten a busy mind.",
    description:
      "The treatment most people picture when they think of massage, and a lovely place to start if you've never had one. I work at a steady, unhurried pace, easing out the knots that build up across the shoulders and lower back. Pressure is entirely up to you — just say, at any point, and I'll adjust.",
    good_for: ["Tension across the neck and shoulders", "Trouble sleeping", "General aches after a long week"],
  },
  {
    slug: "reflexology",
    name: "Reflexology",
    duration: "50 minutes",
    price: "£40",
    summary:
      "Focused pressure on the feet, working through the whole body from the ankles down.",
    description:
      "You stay fully clothed apart from your shoes and socks, settled back in a reclining chair with a blanket. I work methodically over the soles, heels and toes. Most people find it every bit as relaxing as a full body massage, and it's a good choice if being on a couch doesn't appeal.",
    good_for: ["Sluggish digestion", "Swollen or tired feet", "Anyone who'd rather stay clothed"],
  },
  {
    slug: "aromatherapy",
    name: "Aromatherapy Massage",
    duration: "75 minutes",
    price: "£55",
    summary:
      "A massage with essential oils blended for you on the day.",
    description:
      "We start with a chat about how you've been feeling, and I blend a handful of essential oils to suit — lavender and camomile when rest is what's needed, rosemary and grapefruit when it's a lift. The blend goes into a warmed carrier oil, and the massage itself is slow and covering.",
    good_for: ["Low mood or feeling frazzled", "Winding down before a big week", "A treat that lasts"],
  },
  {
    slug: "indian-head-massage",
    name: "Indian Head Massage",
    duration: "30 minutes",
    price: "£28",
    summary:
      "Scalp, neck and shoulders — short, seated, and no oils unless you'd like them.",
    description:
      "Thirty minutes, sitting up, with the option to skip oils entirely so you can head straight back out. I work up through the upper back and shoulders into the scalp. It's the one people book on a lunch break and then come back for properly.",
    good_for: ["Headaches from screens", "A quick reset mid-week", "Tight jaw and temples"],
  },
];

/**
 * Real words from real clients, used with their permission.
 * Ask before you publish anyone — and first names only is plenty.
 */
export const testimonials = [
  {
    quote:
      "I've had a lot of massages over the years and never one where I felt so genuinely looked after. I came out feeling about a foot taller.",
    author: "Marion, Marlow", // ‹‹ CHANGE ME ››
  },
  {
    quote:
      "She spotted where I was holding tension before I'd even said anything. Three sessions in and the headaches I'd had for months have all but gone.",
    author: "Priya, High Wycombe", // ‹‹ CHANGE ME ››
  },
  {
    quote:
      "The room is so warm and calm you forget you're in someone's house. I book the next one before I leave.",
    author: "Tom, Bourne End", // ‹‹ CHANGE ME ››
  },
];

/** The About page. Each string is one paragraph. */
export const about = {
  heading: "Hello, I'm Anne", // ‹‹ CHANGE ME ››
  paragraphs: [
    "I've been practising holistic therapies for over fifteen years, the last eight of them from a small studio at the back of my house. Before that I spent a long time in nursing, which is where I first noticed how much of what people carry physically is really something else entirely.", // ‹‹ CHANGE ME ››
    "My approach is unhurried. Appointments are spaced so nobody is rushed out of the door, and there's always time for a cup of tea afterwards if you'd like one. I'd far rather see four people properly in a day than eight in a hurry.",
    "The studio is warm, quiet and on the ground floor, with parking directly outside. If you have limited mobility, are pregnant, or are going through treatment for anything, please do ring and talk it through with me first — there's nearly always a way to adapt a treatment so it works for you.",
  ],
  /** Qualifications and memberships. Delete any that don't apply. */
  credentials: [
    "ITEC Diploma in Holistic Massage", // ‹‹ CHANGE ME ››
    "Level 3 Diploma in Reflexology",
    "Certified Aromatherapist, IFPA",
    "Fully insured · Enhanced DBS checked",
  ],
};

/** The main menu. Order here = order in the header. */
export const nav = [
  { label: "Home", href: "/" },
  { label: "Treatments", href: "/treatments" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];
