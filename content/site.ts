/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EVERYTHING YOU CAN CHANGE ON THE WEBSITE LIVES IN THIS ONE FILE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Edit the text between the 'quote marks', save, and the site updates.
 *  You do not need to touch any other file to change words or fees.
 *
 *  The wording here is Elizabeth's own, taken from her existing profile, kept
 *  close to how she wrote it. It is her voice and it is good — it has not been
 *  "improved".
 *
 *  Anything still marked  ‹‹ CHECK ››  needs confirming before going live.
 */

export const site = {
  name: "Elizabeth Wand",
  /** Shown under her name. Her actual post-nominals, exactly as she lists them. */
  credentials: "BA (Hons) Counselling · MBACP (Accred)",
  tagline: "Person-centred counselling for adults",
  description:
    "Elizabeth Wand, BACP-accredited counsellor in London E4 and E17. " +
    "Person-centred counselling for adults, in person, online or by phone. " +
    "Experienced in working with ADHD, autism and AuDHD. £60 per 50-minute session.",
  /** Set this once the site has its own web address. */
  url: "https://example.com", // ‹‹ CHECK ›› replace with the real address
};

/**
 * Whether she is taking on new clients.
 *
 * Her directory profile currently says "waiting list for new clients". Saying so
 * plainly is kinder than letting someone write a difficult first email and then
 * wait — and it costs nothing, because people who are willing to wait still get
 * in touch. Set `open: true` when she has space again.
 */
export const availability = {
  open: false,
  waitingListMessage:
    "I have a waiting list for new clients at the moment. Do still get in " +
    "touch — I'll let you know roughly how long the wait is likely to be, and " +
    "we can arrange an initial call when a space comes up.",
  /** How her working week generally looks. */
  hours:
    "Weekdays and weekends, from early morning through to the evening. " +
    "Get in touch and we'll find a time that works.",
};

export const contact = {
  phone: "07907 161 378",
  phoneLink: "+447907161378",
  /** She takes calls and texts on the same number. */
  acceptsText: true,
  email: "hello@example.com", // ‹‹ CHECK ›› her real email address is needed
  /** Partial postcodes only, which is what she publishes. */
  locations: ["London E4", "London E17"],
  /** Leave a link as "" and it disappears from the site. */
  facebook: "",
  instagram: "",
  /**
   * The enquiry form needs somewhere to send messages. Until this is set, the
   * form opens the visitor's own email app with the message written out.
   * A free form at https://formspree.io gives you a URL to paste here.
   */
  formEndpoint: "",
};

/** How sessions can happen. */
export const sessionTypes = [
  { label: "In person", detail: "At the London E4 or E17 rooms" },
  { label: "Online", detail: "Zoom, Microsoft Teams or FaceTime" },
  { label: "By phone", detail: "If you would rather not be on camera" },
];

export const fees = {
  amount: "£60",
  per: "50-minute session",
  /** How long a session runs, written out on its own for use in sentences. */
  duration: "50 minutes",
  note:
    "Sessions are one to one, either for a set number of weeks or open-ended, " +
    "depending on what you need.",
  /** Health insurers and employee assistance programmes she works with. */
  insurers: ["Aviva", "Axa Health", "Vitality", "BUPA"],
};

/** Who she works with. */
export const clientGroups = [
  "Young adults (18–24)",
  "Adults (25–64)",
  "Older adults (65+)",
];

/** Her own words about the work. Each string is one paragraph. */
export const about = {
  heading: "Hello, I'm Elizabeth",
  intro:
    "I'm a fully qualified and widely experienced BACP-accredited counsellor " +
    "offering counselling to adults.",
  paragraphs: [
    "Life can sometimes feel overwhelming, stuck, or difficult, and we may need support to get through these times. It can be hard to speak to those close to us. You might want to be heard, need help understanding your emotions, or seek support for past or present challenges.",
    "I provide a safe, confidential space where you can explore your experiences without judgment. My approach is warm, collaborative, and centred on building a trusting relationship.",
    "Therapy can help you understand yourself, your patterns of behaviour, and your relationships. It can help you heal from past experiences and, in turn, develop coping strategies and build resilience. You are not alone in this process, and together we can work towards a sense of well-being and greater satisfaction in your life.",
    "I have a lot of experience in working with individuals from diverse backgrounds and lived experiences. I also have considerable experience working with those who are neurodivergent or navigating a related diagnosis of ADHD, Autism, or AuDHD.",
    "I offer one-on-one sessions, either for a set period or on an open-ended basis, depending on your needs.",
  ],
};

/** Training and background, in her words. */
export const qualifications = {
  paragraphs: [
    "I hold a First-class BA (Hons) in Person-Centred Counselling from Metanoia Institute / Middlesex University, along with a Clinical Diploma in Person-Centred Counselling from Metanoia Institute. I also have a Certificate in Supervision from Metanoia Institute in London, and have completed Level 2 training in Acceptance & Commitment Therapy (ACT) with APT.",
    "With over 10 years of counselling experience, I have worked in various settings, including the NHS, hospice, community services, a university counselling service, and private practice. During the Covid-19 pandemic in London, I provided counselling to NHS staff and bereaved clients during a challenging and unprecedented time.",
    "In addition to my private practice, I currently work as a supervisor for a Schools Counselling Service, supporting the professional development of other counsellors.",
  ],
  memberships: [
    {
      name: "British Association for Counselling & Psychotherapy",
      detail: "Accredited register membership (MBACP Accred)",
    },
  ],
  /** Shown as short reassurance items. */
  assurances: ["BACP accredited", "DBS checked", "Over 10 years' experience"],
};

/** The approaches she draws on. */
export const therapies = [
  {
    name: "Person-centred therapy",
    detail:
      "The foundation of how I work: you lead, and I follow — no assumptions about what your experience means.",
  },
  {
    name: "Integrative counselling",
    detail: "Drawing on more than one approach, shaped around what helps you.",
  },
  {
    name: "Relational therapy",
    detail:
      "Paying attention to what happens between us, because relationships are often where difficulty shows itself.",
  },
  {
    name: "Humanistic therapies",
    detail: "Starting from the view that you already hold what you need to grow.",
  },
  {
    name: "Acceptance and Commitment Therapy (ACT)",
    detail:
      "Practical work on living alongside difficult thoughts and feelings rather than fighting them.",
  },
];

/**
 * Her particular area of experience. Given a prominent place of its own because
 * it is the thing people most often search for, and the hardest to find someone
 * genuinely experienced in.
 */
export const neurodivergence = {
  heading: "Neurodivergence",
  paragraphs: [
    "I enjoy working with individuals exploring or living with ADHD, autism, dyspraxia, and dyslexia. Over the years, I have supported many clients in navigating the unique challenges these aspects of life present, from the impact on daily life to the complexities of personal, social, and professional relationships.",
  ],
  /**
   * A clear, honest boundary. Left in deliberately — people looking for an
   * assessment need to know quickly that this is not that, and saying so builds
   * more trust than leaving it vague.
   */
  boundary:
    "While I cannot formally diagnose or assess, I bring an understanding and " +
    "a depth of experience in helping individuals manage and thrive in their lives.",
};

/**
 * What she works with. Grouped rather than listed as sixty ticks in a column —
 * an undifferentiated wall is hard to scan, and someone arriving in distress is
 * looking for one word.
 */
export const areasOfCounselling: Array<{ group: string; items: string[] }> = [
  {
    group: "Feeling low, anxious or overwhelmed",
    items: [
      "Anxiety",
      "Depression",
      "Feeling sad",
      "Stress",
      "Burnout",
      "Loneliness",
      "Health anxiety",
      "Social anxiety",
      "Seasonal affective disorder (SAD)",
      "Obsessive compulsive disorder (OCD)",
      "Suicidal thoughts",
      "Self-harm",
      "Mental health",
    ],
  },
  {
    group: "Neurodivergence and learning",
    items: [
      "ADHD",
      "Autism",
      "Neurodiversity",
      "Dyslexia",
      "Dyspraxia",
      "High sensitivity",
      "Learning difficulties",
      "Learning disabilities",
    ],
  },
  {
    group: "Loss and bereavement",
    items: [
      "Bereavement",
      "Baby loss",
      "Miscarriage",
      "Abortion",
      "Pregnancy and birth",
      "Postnatal depression",
      "Cancer",
      "Carer support",
    ],
  },
  {
    group: "Trauma and abuse",
    items: [
      "Trauma",
      "Post-traumatic stress disorder (PTSD)",
      "Abuse",
      "Physical abuse",
      "Sexual assault",
      "Narcissistic abuse",
      "Bullying",
      "Attachment disorder",
    ],
  },
  {
    group: "Relationships and family",
    items: [
      "Relationship problems",
      "Family issues",
      "Separation and divorce",
      "Affairs and betrayals",
      "Non-monogamy",
      "Jealousy",
      "Behaviour problems",
      "Anger management",
    ],
  },
  {
    group: "Identity and belonging",
    items: [
      "LGBTQ+ counselling",
      "Race and racial identity",
      "Racism",
      "Spirituality",
      "Low self-esteem",
      "Low self-confidence",
      "Perfectionism",
    ],
  },
  {
    group: "Work, money and life stages",
    items: [
      "Work-related stress",
      "Career counselling",
      "Redundancy",
      "Money",
      "Menopause",
      "Addiction",
      "Older people's counselling",
      "Young people's counselling",
    ],
  },
];

/** A separate service, for qualified counsellors rather than clients. */
export const supervision = {
  heading: "Supervision for counsellors",
  body:
    "I offer clinical supervision in person and online, and I'm experienced in " +
    "supporting counsellors and therapists to develop a private practice.",
  detail: "Person-centred counsellor and supervisor.",
};

/** The main menu. Order here = order in the header. */
export const nav = [
  { label: "Home", href: "/" },
  { label: "How I work", href: "/how-i-work" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * Session types for the admin diary.
 *
 * Kept in the same shape the diary already expects, so booking a session offers
 * these rather than a list of massages.
 */
export const treatments = [
  {
    slug: "counselling",
    name: "Counselling session",
    duration: "50 minutes",
    price: "£60",
    summary: "One-to-one counselling, in person, online or by phone.",
    description:
      "A standard 50-minute one-to-one session, either for a set number of weeks or open-ended.",
    good_for: ["Individual work"],
  },
  {
    slug: "initial-call",
    name: "Initial call",
    duration: "20 minutes",
    price: "£0",
    summary: "A short first conversation, at no charge.",
    description:
      "A chance to talk briefly about what you're looking for and whether working together feels right.",
    good_for: ["First contact"],
  },
  {
    slug: "supervision",
    name: "Supervision",
    duration: "60 minutes",
    price: "£60",
    summary: "Clinical supervision for qualified counsellors.",
    description:
      "Supervision in person or online, including support for counsellors building a private practice.",
    good_for: ["Counsellors and therapists"],
  },
];

/** Opening hours, used by the admin dashboard and the footer. */
export const hours = [
  { day: "Monday", time: "Morning – evening" },
  { day: "Tuesday", time: "Morning – evening" },
  { day: "Wednesday", time: "Morning – evening" },
  { day: "Thursday", time: "Morning – evening" },
  { day: "Friday", time: "Morning – evening" },
  { day: "Saturday", time: "By arrangement" },
  { day: "Sunday", time: "By arrangement" },
];
