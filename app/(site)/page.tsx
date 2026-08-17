import Link from "next/link";
import StructuredData from "@/components/StructuredData";
import {
  about,
  areasOfCounselling,
  availability,
  clientGroups,
  contact,
  faqs,
  fees,
  howCounsellingWorks,
  neurodivergence,
  qualifications,
  sessionTypes,
  site,
  supervision,
} from "@/content/site";

/**
 * The home page reads top to bottom like a printed page: hero, what she works
 * with, who she is, how the work goes, the practical details, availability,
 * questions, and how to reach her.
 *
 * Each section is composed differently on purpose — a reading column, then an
 * index in columns, then a portrait beside text, then numbered steps, then a
 * table of facts. Nothing is wrapped in a card, and no two neighbouring
 * sections share a shape, so scrolling feels like turning pages rather than
 * flicking through tiles.
 */
export default function HomePage() {
  return (
    <>
      <StructuredData />

      {/* ---------------------------------------------------------------- 2
          Hero. One headline on a controlled measure, her own opening line, the
          two ways to reach her — and the three facts people look for first in a
          narrow column beside it on a laptop, stacked underneath on a phone. */}
      <section className="wrap hero hero-grid">
        <div>
          <p className="kicker">{site.tagline}</p>
          <h1 className="display">Somewhere to be heard, without judgement</h1>
          <p className="lede">{about.intro}</p>

          <div className="actions">
            <a className="tel" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
            <Link className="cta-link" href="/contact">
              Arrange an initial call
            </Link>
          </div>
        </div>

        <ul className="hero-facts">
          <li>
            <p className="hero-facts-label">Sessions</p>
            <p>
              {fees.amount} · {fees.duration}
            </p>
          </li>
          <li>
            <p className="hero-facts-label">Where</p>
            <p>{contact.locations.join(", ")}, online or by phone</p>
          </li>
          <li>
            <p className="hero-facts-label">Availability</p>
            <p>
              {availability.open
                ? "Taking on new clients"
                : "Waiting list for new clients"}
            </p>
          </li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- 3
          A short introduction, then the index of what people bring. Set as a
          printed index rather than chips: someone in distress is scanning for
          one word, and a word is not a button. */}
      <section className="band band-rule">
        <div className="wrap">
          {/* Full page width rather than the label-and-column layout used
              elsewhere: an index needs room, and sixty words squeezed into a
              two-thirds column wrap two to a line. */}
          <p className="kicker kicker-rule">What people bring</p>
          <h2>Things I work with</h2>
          <p className="lede" style={{ marginBottom: "2.25rem" }}>
            You don&rsquo;t need to find your feeling on this list, or be able
            to name it at all, before getting in touch.
          </p>
          <div className="index">
            {areasOfCounselling.map((group) => (
              <div className="index-group" key={group.group}>
                <h3>{group.group}</h3>
                {/* Non-breaking space before each separator, so a line never
                    begins or ends with a stray dot. */}
                <p className="index-words">{group.items.join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 4
          About Elizabeth. Tinted ground, a pull quote opening it, her own
          paragraphs on a reading measure, and a portrait beside them once
          there is a photograph to use. */}
      <section className="band band-tint">
        <div className="wrap">
          <div className="editorial editorial-wide">
            <div className="editorial-label">
              <p className="kicker kicker-rule">About</p>
              {about.portrait ? (
                <figure className="portrait">
                  <img
                    src={about.portrait}
                    alt={about.portraitAlt}
                    width={400}
                    height={400}
                  />
                </figure>
              ) : null}
              <h2>{about.heading}</h2>
              <p className="fine" style={{ margin: 0 }}>
                {site.credentials}
              </p>
            </div>

            <div>
              <p className="pull" style={{ marginBottom: "1.75rem" }}>
                {about.paragraphs[1]}
              </p>
              <div className="prose">
                {[
                  about.paragraphs[0],
                  about.paragraphs[2],
                  about.paragraphs[3],
                ].map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              <div className="actions">
                <Link className="cta-link" href="/about">
                  More about my training and experience
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 4b
          Her deepest area of experience, and the thing people most often search
          for by name. Deliberately the quietest shape on the page: one column,
          no label in the margin, with the honest boundary set as a note. */}
      <section className="band">
        <div className="wrap">
          <p className="kicker kicker-rule">A particular interest</p>
          <h2>{neurodivergence.heading}</h2>
          <div className="prose-wide" style={{ marginBottom: "2rem" }}>
            {neurodivergence.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <div className="note">
            <p className="kicker">Worth saying plainly</p>
            <p>{neurodivergence.boundary}</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 5
          How counselling works. Numbered, because it is a sequence — the
          numerals and the rules are the structure. */}
      <section className="band band-tint">
        <div className="wrap">
          <div className="editorial editorial-wide">
            <div className="editorial-label">
              <p className="kicker kicker-rule">How it works</p>
              <h2>From first call to ending</h2>
            </div>
            <ol className="steps">
              {howCounsellingWorks.map((step) => (
                <li key={step.heading}>
                  <h3>{step.heading}</h3>
                  <div>
                    {step.paragraphs.map((paragraph, index) => (
                      <p
                        key={index}
                        style={index > 0 ? { marginTop: "0.7rem" } : undefined}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 6
          Practical information. A table of facts on hairlines — the shape this
          content actually wants, rather than six cards pretending to be
          features. */}
      <section className="band">
        <div className="wrap">
          {/* Heading above, table across the full width — a different shape
              again from the section before and the one after it. */}
          <p className="kicker kicker-rule">Practical</p>
          <h2 style={{ marginBottom: "1.75rem" }}>
            Fees, times and ways to meet
          </h2>

          <dl className="facts">
            <div>
              <dt>Fee</dt>
              <dd>
                <span className="fee-figure">
                  {fees.amount} <span>per {fees.per}</span>
                </span>
                <p className="fine">{fees.note}</p>
              </dd>
            </div>

            <div>
              <dt>Ways to meet</dt>
              <dd>
                <ul className="aside-list">
                  {sessionTypes.map((type) => (
                    <li key={type.label}>
                      <strong>{type.label}</strong>
                      {type.detail}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>

            <div>
              <dt>Times</dt>
              <dd>{availability.hours}</dd>
            </div>

            <div>
              <dt>Health insurance</dt>
              <dd>{fees.insurers.join(" · ")}</dd>
            </div>

            <div>
              <dt>Who I work with</dt>
              <dd>{clientGroups.join(" · ")}</dd>
            </div>

            <div>
              <dt>Supervision</dt>
              <dd>
                {supervision.body}
                <p className="fine" style={{ marginBottom: 0 }}>
                  <Link href="/contact">Enquire about supervision</Link>
                </p>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 7
          Current availability. Its own quiet band: someone who has worked up
          the courage to write deserves to know about the wait first. */}
      <section className="band band-tight band-tint">
        <div className="wrap">
          <div className="editorial">
            <p className="kicker editorial-label" style={{ marginBottom: 0 }}>
              Current availability
            </p>
            <div className="prose-wide">
              <p style={{ marginBottom: 0 }}>
                {availability.open
                  ? `I am taking on new clients. ${availability.hours}`
                  : availability.waitingListMessage}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 8
          Questions people ask before a first appointment. Native details
          elements on hairlines. */}
      <section className="band">
        <div className="wrap">
          <div className="editorial editorial-wide">
            <div className="editorial-label">
              <p className="kicker kicker-rule">Questions</p>
              <h2>Before you get in touch</h2>
            </div>
            <div className="faq">
              {faqs.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <div className="faq-answer">
                    {item.answer.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 9
          The closing contact section. The one saturated block on the page, and
          the place the whole page has been walking towards. */}
      <section className="band band-deep">
        <div className="wrap">
          <p className="kicker kicker-rule">Getting in touch</p>
          <h2 style={{ maxWidth: "24ch" }}>
            A sentence is plenty to start with
          </h2>
          <p className="lede">
            Getting in touch is often the hardest part. You don&rsquo;t need to
            explain everything, and there is no obligation either way.
          </p>

          <div className="actions">
            <a className="tel" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
            <Link className="btn btn-primary" href="/contact">
              Send a message
            </Link>
          </div>

          <ul className="assurances" style={{ marginTop: "2.5rem" }}>
            {qualifications.assurances.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
