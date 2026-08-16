import type { Metadata } from "next";
import Link from "next/link";
import { about, site } from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description: `Meet the therapist behind ${site.name} — training, experience and how she likes to work.`,
};

export default function AboutPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">About</p>
          <h1>{about.heading}</h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            {about.paragraphs.map((paragraph, index) => (
              <p key={index} style={index === 0 ? { fontSize: "1.15rem" } : undefined}>
                {paragraph}
              </p>
            ))}
          </div>

          <aside className="card">
            <h3>Training &amp; memberships</h3>
            <ul className="tick-list" style={{ marginTop: "1rem" }}>
              {about.credentials.map((credential) => (
                <li key={credential}>{credential}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section cta">
        <div className="wrap wrap-narrow">
          <h2>Come and say hello</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            Whether you&rsquo;ve had a hundred massages or none at all, you&rsquo;re
            very welcome here.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Book a treatment
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
