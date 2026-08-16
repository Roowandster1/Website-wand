import type { Metadata } from "next";
import Link from "next/link";
import { treatments } from "@/content/site";

export const metadata: Metadata = {
  title: "Treatments & prices",
  description:
    "Massage, reflexology, aromatherapy and Indian head massage — what each treatment involves, how long it takes and what it costs.",
};

export default function TreatmentsPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Treatments</p>
          <h1>What I offer</h1>
          <p className="lede">
            Every treatment below includes time at the start to talk through how
            you&rsquo;re feeling, and time at the end to come round properly.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          {treatments.map((treatment) => (
            <article className="treatment" key={treatment.slug} id={treatment.slug}>
              <div>
                <p className="treatment-price">{treatment.price}</p>
                <p className="treatment-duration">{treatment.duration}</p>
                <p style={{ marginTop: "1rem" }}>
                  <Link href="/contact">Book this &rarr;</Link>
                </p>
              </div>

              <div>
                <h2>{treatment.name}</h2>
                <p className="lede" style={{ fontSize: "1.08rem" }}>
                  {treatment.summary}
                </p>
                <div className="prose">
                  <p>{treatment.description}</p>
                </div>
                <ul className="tag-list">
                  {treatment.good_for.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section cta">
        <div className="wrap wrap-narrow">
          <h2>Not sure which to book?</h2>
          <p className="lede" style={{ marginInline: "auto" }}>
            Tell me roughly how you&rsquo;ve been feeling and I&rsquo;ll suggest
            something. There&rsquo;s no obligation either way.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/contact">
              Ask a question
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
