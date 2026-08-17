import Link from "next/link";
import {
  about,
  areasOfCounselling,
  availability,
  clientGroups,
  contact,
  fees,
  neurodivergence,
  qualifications,
  sessionTypes,
  supervision,
  therapies,
} from "@/content/site";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">
              Counselling · {contact.locations.join(" & ")} · Online
            </p>
            <h1>Somewhere to be heard, without judgement</h1>
            <p className="lede">{about.intro}</p>
            <div className="btn-row">
              <Link className="btn btn-primary" href="/contact">
                Get in touch
              </Link>
              <Link className="btn btn-secondary" href="/how-i-work">
                How I work
              </Link>
            </div>
            <p className="hero-note">
              An initial call costs nothing and commits you to nothing. It
              simply gives us both a chance to see whether working together
              feels right.
            </p>
          </div>

          <div className="hero-panel">
            <h2>Ring or text me</h2>
            <a className="hero-phone" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
              {contact.acceptsText
                ? "Calls and texts both welcome."
                : "Calls welcome."}
            </p>
            <ul className="detail-list stacked" style={{ marginTop: "1.25rem" }}>
              {sessionTypes.map((type) => (
                <li key={type.label} style={{ padding: "0.55rem 0" }}>
                  <span>{type.label}</span>
                  <span className="muted">{type.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Said plainly and said early. Someone who has worked up the courage to
          write a first message deserves to know about the wait before they
          write it, not a fortnight afterwards. */}
      {!availability.open && (
        <section className="section" style={{ paddingBottom: 0 }}>
          <div className="wrap">
            <div className="notice">
              <h2>Availability</h2>
              <p>{availability.waitingListMessage}</p>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            <p className="eyebrow">How I can help</p>
            {about.paragraphs.slice(0, 3).map((paragraph, index) => (
              <p
                key={index}
                style={index === 0 ? { fontSize: "1.15rem" } : undefined}
              >
                {paragraph}
              </p>
            ))}
            <p>
              <Link href="/about">More about me and my training &rarr;</Link>
            </p>
          </div>

          <div className="stack">
            <div className="card">
              <h3>Sessions</h3>
              <div className="fee" style={{ marginTop: "1rem" }}>
                <strong>{fees.amount}</strong>
                <span>per {fees.per}</span>
              </div>
              <p>{fees.note}</p>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                I also work with {fees.insurers.join(", ")}.
              </p>
            </div>

            <div className="card">
              <h3>Who I work with</h3>
              <ul className="tick-list" style={{ marginTop: "0.85rem" }}>
                {clientGroups.map((group) => (
                  <li key={group}>{group}</li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3>When</h3>
              <p style={{ marginTop: "0.85rem" }}>{availability.hours}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Her deepest area of experience, and the thing people most often search
          for by name. It gets a section of its own rather than one word inside a
          list of sixty. */}
      <section className="section section-tinted">
        <div className="wrap split">
          <div>
            <p className="eyebrow">A particular interest</p>
            <h2>{neurodivergence.heading}</h2>
            <div className="prose">
              {neurodivergence.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="notice">
            <h3>Worth saying plainly</h3>
            <p>{neurodivergence.boundary}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">What people bring</p>
          <h2>Things I work with</h2>
          <p className="lede">
            You don&rsquo;t need to find your feeling on this list, or be able
            to name it at all, before getting in touch.
          </p>

          <div className="areas">
            {areasOfCounselling.map((group) => (
              <div className="area-group" key={group.group}>
                <h3>{group.group}</h3>
                {/* The non-breaking space keeps each separator attached to the
                    word before it, so a line never begins or ends with a dot. */}
                <p className="word-list">{group.items.join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="wrap">
          <p className="eyebrow">How I work</p>
          <h2>The approaches I draw on</h2>
          <div className="grid grid-pairs">
            {therapies.map((therapy) => (
              <article className="card" key={therapy.name}>
                <h3>{therapy.name}</h3>
                <p>{therapy.detail}</p>
              </article>
            ))}
          </div>
          <div className="btn-row">
            <Link className="btn btn-secondary" href="/how-i-work">
              What sessions are actually like
            </Link>
          </div>
        </div>
      </section>

      {/* One quiet line, not a whole section's worth of air around it. */}
      <section className="section" style={{ paddingBlock: "2.5rem" }}>
        <div className="wrap wrap-narrow" style={{ textAlign: "center" }}>
          <ul className="assurances">
            {qualifications.assurances.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* For counsellors rather than clients — kept short and kept last, so it
          never gets in the way of someone looking for therapy. */}
      <section className="section section-tinted">
        <div className="wrap wrap-narrow">
          <div className="card">
            <h3>{supervision.heading}</h3>
            <p style={{ marginTop: "0.85rem" }}>{supervision.body}</p>
            <p>
              <Link href="/contact">Enquire about supervision &rarr;</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="section cta">
        <div className="wrap wrap-narrow">
          <h2>Taking the first step</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            Getting in touch is often the hardest part. There&rsquo;s no need to
            explain everything in your first message — a sentence is plenty.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Arrange an initial call
            </Link>
            <a className="btn btn-secondary" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
