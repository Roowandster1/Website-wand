import type { Metadata } from "next";
import Link from "next/link";
import { about, contact, qualifications, site, supervision } from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description: `About ${site.name}, ${site.credentials} — training, experience and how she works.`,
};

export default function AboutPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">About</p>
          <h1>{about.heading}</h1>
          <p className="lede">{about.intro}</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            {about.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}

            <h2>Training and experience</h2>
            {qualifications.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          <div className="stack">
            <aside className="card">
              <h3>Qualifications</h3>
              <ul className="tick-list" style={{ marginTop: "0.85rem" }}>
                <li>{site.credentials}</li>
                {qualifications.assurances.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>

            <aside className="card">
              <h3>Professional membership</h3>
              <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
                {qualifications.memberships.map((membership) => (
                  <li
                    key={membership.name}
                    style={{ display: "grid", gap: "0.2rem" }}
                  >
                    <span>{membership.name}</span>
                    <span className="muted" style={{ fontSize: "0.92rem" }}>
                      {membership.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                Being on an accredited register means my training,
                confidentiality and ethical practice are held to a published
                standard, and that you have somewhere independent to go if
                you&rsquo;re ever unhappy with my work.
              </p>
            </aside>

            <aside className="card">
              <h3>Where I work</h3>
              <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
                {contact.locations.map((place) => (
                  <li key={place}>{place}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

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
          <h2>If any of this sounds like what you&rsquo;re looking for</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            Do get in touch. A first conversation costs nothing and commits you
            to nothing.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Get in touch
            </Link>
            <Link className="btn btn-secondary" href="/how-i-work">
              How I work
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
