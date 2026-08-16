import Link from "next/link";
import { about, contact, hours, testimonials, treatments } from "@/content/site";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Massage · Reflexology · Aromatherapy</p>
            <h1>An hour that&rsquo;s genuinely yours</h1>
            <p className="lede">
              Unhurried holistic treatments in a warm, quiet home studio — with
              time for a cup of tea afterwards, and no rushing you out of the
              door.
            </p>
            <div className="btn-row">
              <Link className="btn btn-primary" href="/contact">
                Book a treatment
              </Link>
              <Link className="btn btn-secondary" href="/treatments">
                See treatments &amp; prices
              </Link>
            </div>
            <p className="hero-note">
              New here? Ring for a chat first — there&rsquo;s no obligation to
              book.
            </p>
          </div>

          <div className="hero-panel">
            <h2>Ring me</h2>
            <a className="hero-phone" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
              {contact.location}
            </p>
            <ul className="detail-list" style={{ marginTop: "1.25rem" }}>
              {hours.map((entry) => (
                <li key={entry.day} style={{ padding: "0.45rem 0" }}>
                  <span>{entry.day}</span>
                  <span className="muted">{entry.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Treatments</p>
          <h2>Choose what you need today</h2>
          <p className="lede" style={{ marginBottom: "2.5rem" }}>
            Not sure which is right for you? Say so when you get in touch and
            we&rsquo;ll work it out together.
          </p>

          <div className="grid grid-pairs">
            {treatments.map((treatment) => (
              <article className="card" key={treatment.slug}>
                <h3>{treatment.name}</h3>
                <p className="card-meta">
                  {treatment.duration} · {treatment.price}
                </p>
                <p>{treatment.summary}</p>
              </article>
            ))}
          </div>

          <div className="btn-row">
            <Link className="btn btn-secondary" href="/treatments">
              Full details and prices
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="wrap split">
          <div>
            <p className="eyebrow">What to expect</p>
            <h2>Your first visit</h2>
            <div className="prose">
              <p>
                We&rsquo;ll start with a proper conversation — how you&rsquo;ve
                been feeling, anything that aches, anything you&rsquo;d rather
                I avoided. That takes about ten minutes and it&rsquo;s part of
                the appointment, not on top of it.
              </p>
              <p>
                The studio is on the ground floor, warm, and there&rsquo;s
                parking right outside. You&rsquo;re covered by a towel
                throughout, and you never have to remove more than
                you&rsquo;re comfortable with.
              </p>
              <p>
                Afterwards there&rsquo;s water, or tea if you&rsquo;d like to
                sit for a while before driving. Most people do.
              </p>
            </div>
          </div>

          <div className="card">
            <h3>Good to know</h3>
            <ul className="tick-list" style={{ marginTop: "1rem" }}>
              <li>Ground-floor room, no stairs</li>
              <li>Free parking directly outside</li>
              <li>Treatments adapted for pregnancy and reduced mobility</li>
              <li>Cash, card or bank transfer</li>
              <li>24 hours&rsquo; notice to change an appointment</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Kind words</p>
          <h2>From people who come back</h2>
          <div className="grid" style={{ marginTop: "2.5rem" }}>
            {testimonials.map((testimonial) => (
              <blockquote className="quote" key={testimonial.author}>
                <p>&ldquo;{testimonial.quote}&rdquo;</p>
                <footer>— {testimonial.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="section cta">
        <div className="wrap wrap-narrow">
          <h2>{about.heading}</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            {about.paragraphs[0]}
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Get in touch
            </Link>
            <Link className="btn btn-secondary" href="/about">
              More about me
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
