import type { Metadata } from "next";
import Link from "next/link";
import {
  availability,
  clientGroups,
  contact,
  fees,
  howCounsellingWorks,
  neurodivergence,
  sessionTypes,
  supervision,
  therapies,
} from "@/content/site";

export const metadata: Metadata = {
  title: "How I work",
  description:
    "What counselling sessions are like, the approaches I draw on, how long " +
    "sessions last and what they cost. In person in London E4 and E17, online or by phone.",
};

export default function HowIWorkPage() {
  return (
    <>
      <section className="wrap page-head">
        <p className="kicker">How I work</p>
        <h1>What to expect</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          Therapy is a strange thing to arrange when you&rsquo;ve never done it
          before. Here is what actually happens, so there are fewer unknowns
          before you ring.
        </p>
      </section>

      <section className="band">
        <div className="wrap with-aside">
          <div>
            {howCounsellingWorks.map((step, stepIndex) => (
              <div
                key={step.heading}
                style={{ maxWidth: "var(--measure-wide)" }}
              >
                <h2 style={stepIndex > 0 ? { marginTop: "2.75rem" } : undefined}>
                  {step.heading}
                </h2>
                <div className="prose">
                  {step.paragraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside>
            <div className="aside-block">
              <h3>Fee</h3>
              <p className="fee-figure" style={{ marginBottom: "0.4rem" }}>
                {fees.amount} <span>per {fees.per}</span>
              </p>
              <p>The initial call is free.</p>
            </div>

            <div className="aside-block">
              <h3>Ways we can meet</h3>
              <ul className="aside-list">
                {sessionTypes.map((type) => (
                  <li key={type.label}>
                    <strong>{type.label}</strong>
                    {type.detail}
                  </li>
                ))}
              </ul>
            </div>

            <div className="aside-block">
              <h3>Health insurance</h3>
              <p>
                I work with {fees.insurers.join(", ")}. If your policy or your
                employer&rsquo;s assistance programme covers counselling, do
                mention it when you get in touch.
              </p>
            </div>

            <div className="aside-block">
              <h3>Who I work with</h3>
              <p>{clientGroups.join(" · ")}</p>
            </div>

            {!availability.open && (
              <div className="aside-block">
                <h3>Current availability</h3>
                <p>{availability.waitingListMessage}</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="band band-tint">
        <div className="wrap">
          <div className="editorial editorial-wide">
            <div className="editorial-label">
              <p className="kicker kicker-rule">Approaches</p>
              <h2>What I draw on</h2>
            </div>
            <div>
              <p className="lede" style={{ marginBottom: "1.75rem" }}>
                You don&rsquo;t need to know or care about any of these names.
                They simply describe where the way I work comes from.
              </p>
              <dl className="approaches">
                {therapies.map((therapy) => (
                  <div key={therapy.name}>
                    <dt>{therapy.name}</dt>
                    <dd>{therapy.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="editorial editorial-wide">
            <div className="editorial-label">
              <p className="kicker kicker-rule">A particular interest</p>
              <h2>{neurodivergence.heading}</h2>
            </div>
            <div>
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
          </div>
        </div>
      </section>

      <section className="band band-tight band-tint">
        <div className="wrap">
          <div className="editorial">
            <p className="kicker editorial-label" style={{ marginBottom: 0 }}>
              {supervision.heading}
            </p>
            <div className="prose-wide">
              <p style={{ marginBottom: 0 }}>{supervision.body}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band band-deep">
        <div className="wrap">
          <p className="kicker kicker-rule">Getting in touch</p>
          <h2 style={{ maxWidth: "22ch" }}>Still not sure?</h2>
          <p className="lede">
            That&rsquo;s normal, and it&rsquo;s exactly what the first call is
            for. Ring, text or send a message and we can talk it through.
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
