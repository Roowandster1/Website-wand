import type { Metadata } from "next";
import Link from "next/link";
import {
  availability,
  clientGroups,
  contact,
  fees,
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
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">How I work</p>
          <h1>What to expect</h1>
          <p className="lede">
            Therapy is a strange thing to arrange when you&rsquo;ve never done
            it before. Here is what actually happens, so there are fewer
            unknowns before you ring.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div className="prose">
            <h2>The first conversation</h2>
            <p>
              We start with a short call. You can tell me as much or as little
              as you like about what&rsquo;s brought you here, and ask me
              anything you want to know about how I work. Nothing is decided in
              that call and there is no charge for it.
            </p>
            <p>
              If we both feel it&rsquo;s a good fit, we&rsquo;ll arrange a first
              session. If not, I&rsquo;ll say so honestly, and where I can
              I&rsquo;ll point you towards someone who might suit you better.
            </p>

            <h2>Sessions themselves</h2>
            <p>
              Each session lasts {fees.duration}, and we meet at the same time
              each week wherever possible — the rhythm matters more than people
              expect. {fees.note}
            </p>
            <p>
              There is no set agenda. You bring what&rsquo;s present for you
              that week; I listen properly, and I don&rsquo;t decide in advance
              what your experience means. Some weeks that looks like working
              through something specific, and some weeks it looks like thinking
              out loud with someone who isn&rsquo;t going to flinch.
            </p>

            <h2>Confidentiality</h2>
            <p>
              What you say to me stays between us. Like all accredited
              counsellors I discuss my work regularly in clinical supervision,
              which is how the profession keeps itself safe and useful — your
              identity isn&rsquo;t part of those conversations. The rare
              exceptions, where there&rsquo;s a serious risk to your safety or
              someone else&rsquo;s, I&rsquo;ll always talk through with you
              first wherever it&rsquo;s possible to do so.
            </p>

            <h2>Endings</h2>
            <p>
              Some people come for a set number of weeks with something
              particular in mind; others stay open-ended and stop when it feels
              finished. Either is fine, and you are never committed to more
              sessions than you want. When you do decide to finish, it helps to
              have a session or two to end properly rather than simply
              stopping.
            </p>
          </div>

          <div className="stack">
            <div className="card">
              <h3>Fees</h3>
              <div className="fee" style={{ marginTop: "1rem" }}>
                <strong>{fees.amount}</strong>
                <span>per {fees.per}</span>
              </div>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                The initial call is free.
              </p>
            </div>

            <div className="card">
              <h3>Health insurance</h3>
              <p style={{ marginTop: "0.85rem" }}>
                I work with {fees.insurers.join(", ")}. If your policy or your
                employer&rsquo;s assistance programme covers counselling, do
                mention it when you get in touch.
              </p>
            </div>

            <div className="card">
              <h3>Ways we can meet</h3>
              <ul className="detail-list stacked" style={{ marginTop: "0.75rem" }}>
                {sessionTypes.map((type) => (
                  <li key={type.label}>
                    <span>{type.label}</span>
                    <span className="muted">{type.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3>Who I work with</h3>
              <ul className="tick-list" style={{ marginTop: "0.85rem" }}>
                {clientGroups.map((group) => (
                  <li key={group}>{group}</li>
                ))}
              </ul>
            </div>

            {!availability.open && (
              <div className="notice">
                <h3>Availability</h3>
                <p>{availability.waitingListMessage}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section section-tinted">
        <div className="wrap">
          <p className="eyebrow">Approaches</p>
          <h2>What I draw on</h2>
          <p className="lede">
            You don&rsquo;t need to know or care about any of these names. They
            simply describe where the way I work comes from.
          </p>
          <div className="grid grid-pairs" style={{ marginTop: "2.5rem" }}>
            {therapies.map((therapy) => (
              <article className="card" key={therapy.name}>
                <h3>{therapy.name}</h3>
                <p>{therapy.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
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

      <section className="section section-tinted">
        <div className="wrap wrap-narrow">
          <div className="card">
            <h3>{supervision.heading}</h3>
            <p style={{ marginTop: "0.85rem" }}>{supervision.body}</p>
          </div>
        </div>
      </section>

      <section className="section cta">
        <div className="wrap wrap-narrow">
          <h2>Still not sure?</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            That&rsquo;s normal, and it&rsquo;s exactly what the first call is
            for. Ring, text or send a message and we can talk it through.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Get in touch
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
