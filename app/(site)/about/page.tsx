import type { Metadata } from "next";
import Link from "next/link";
import {
  about,
  contact,
  qualifications,
  site,
  supervision,
} from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description: `About ${site.name}, ${site.credentials} — training, experience and how she works.`,
};

export default function AboutPage() {
  return (
    <>
      <section className="wrap page-head">
        <p className="kicker">About</p>
        <h1>{about.heading}</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          {about.intro}
        </p>
      </section>

      <section className="band">
        <div className="wrap with-aside">
          <div>
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

            <div className="prose">
              {about.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <h2 style={{ marginTop: "3rem" }}>Training and experience</h2>
            <div className="prose">
              {qualifications.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>

          <aside>
            <div className="aside-block">
              <h3>Qualifications</h3>
              <p>{site.credentials}</p>
            </div>

            <div className="aside-block">
              <h3>Professional membership</h3>
              {qualifications.memberships.map((membership) => (
                <p key={membership.name}>
                  {membership.name}
                  <br />
                  {membership.detail}
                </p>
              ))}
              <p>
                Being on an accredited register means my training,
                confidentiality and ethical practice are held to a published
                standard, and that you have somewhere independent to go if
                you&rsquo;re ever unhappy with my work.
              </p>
            </div>

            <div className="aside-block">
              <h3>Where I work</h3>
              <p>{contact.locations.join(" · ")}</p>
              <p>Online and by phone.</p>
            </div>

            <div className="aside-block">
              <h3>{supervision.heading}</h3>
              <p>{supervision.body}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="band band-tight band-tint band-rule">
        <div className="wrap">
          <ul className="assurances">
            {qualifications.assurances.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band band-deep">
        <div className="wrap">
          <p className="kicker kicker-rule">Getting in touch</p>
          <h2 style={{ maxWidth: "26ch" }}>
            If any of this sounds like what you&rsquo;re looking for
          </h2>
          <p className="lede">
            Do get in touch. A first conversation costs nothing and commits you
            to nothing.
          </p>
          <div className="actions">
            <a className="tel" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
            <Link className="btn btn-primary" href="/contact">
              Send a message
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
