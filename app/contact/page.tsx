import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { contact, hours } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact & booking",
  description:
    "Book a treatment or ask a question — by phone, email or the enquiry form. Opening hours and location.",
};

export default function ContactPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Contact</p>
          <h1>Book a treatment</h1>
          <p className="lede">
            Ring, email, or fill in the form below — whichever suits. I answer
            every enquiry personally, usually within a day or two.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <div>
            <h2>Send an enquiry</h2>
            <ContactForm />
          </div>

          <div style={{ display: "grid", gap: "1.5rem" }}>
            <div className="card">
              <h3>Ring or email</h3>
              <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
                <li>
                  <span className="muted">Phone</span>
                  <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a>
                </li>
                <li>
                  <span className="muted">Email</span>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
                <li>
                  <span className="muted">Where</span>
                  <span style={{ textAlign: "right" }}>{contact.location}</span>
                </li>
              </ul>
            </div>

            <div className="card">
              <h3>Opening hours</h3>
              <ul className="detail-list" style={{ marginTop: "0.75rem" }}>
                {hours.map((entry) => (
                  <li key={entry.day}>
                    <span>{entry.day}</span>
                    <span className="muted">{entry.time}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3>Before you book</h3>
              <p style={{ marginTop: "0.75rem" }}>
                If you&rsquo;re pregnant, recovering from surgery, or having
                treatment for anything ongoing, please ring rather than booking
                online — there&rsquo;s nearly always a way to adapt a treatment,
                and it&rsquo;s easier to talk it through.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
