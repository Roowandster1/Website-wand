import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { availability, contact, sessionTypes } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch to arrange an initial call — by phone, text, email or the " +
    "enquiry form. Counselling in London E4 and E17, online or by phone.",
};

export default function ContactPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Contact</p>
          <h1>Get in touch</h1>
          <p className="lede">
            Ring, text, email or fill in the form — whichever feels easiest. You
            don&rsquo;t need to explain everything to begin with; a sentence is
            plenty. I reply to every enquiry myself.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div>
            <h2>Send a message</h2>
            <ContactForm />
          </div>

          <div className="stack">
            {!availability.open && (
              <div className="notice">
                <h3>Availability</h3>
                <p>{availability.waitingListMessage}</p>
              </div>
            )}

            <div className="card">
              <h3>Ring, text or email</h3>
              <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
                <li>
                  <span className="muted">Phone or text</span>
                  <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a>
                </li>
                <li>
                  <span className="muted">Email</span>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
                <li>
                  <span className="muted">Where</span>
                  <span style={{ textAlign: "right" }}>
                    {contact.locations.join(" & ")}
                  </span>
                </li>
              </ul>
              <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)" }}>
                If I can&rsquo;t answer I&rsquo;m most likely in a session — do
                leave a message or a text and I&rsquo;ll come back to you.
              </p>
            </div>

            <div className="card">
              <h3>When</h3>
              <p style={{ marginTop: "0.85rem" }}>{availability.hours}</p>
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

            {/* Counselling is not a crisis service, and saying where to go
                instead is more useful than an apology. */}
            <div className="card">
              <h3>If you need help right now</h3>
              <p style={{ marginTop: "0.85rem" }}>
                I&rsquo;m not able to offer emergency support, and I may not see
                your message for a day or two. If you&rsquo;re in crisis or
                don&rsquo;t feel safe, please ring the Samaritans free on{" "}
                <a href="tel:116123">116 123</a>, any time of day or night, or
                NHS 111. In an emergency, ring 999.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
