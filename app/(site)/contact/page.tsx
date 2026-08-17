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
      <section className="wrap page-head">
        <p className="kicker">Contact</p>
        <h1>Get in touch</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          Ring, text, email or fill in the form — whichever feels easiest. You
          don&rsquo;t need to explain everything to begin with; a sentence is
          plenty. I reply to every enquiry myself.
        </p>
      </section>

      {/* The phone number first and largest. It is the most useful thing on the
          page for the people least likely to fill in a form. */}
      <section className="band band-tight band-rule">
        <div className="wrap">
          <div className="editorial">
            <p className="kicker editorial-label" style={{ marginBottom: 0 }}>
              Ring or text
            </p>
            <div>
              <a className="tel" href={`tel:${contact.phoneLink}`}>
                {contact.phone}
              </a>
              <p className="fine" style={{ margin: "0.85rem 0 0" }}>
                If I can&rsquo;t answer I&rsquo;m most likely in a session — do
                leave a message or a text and I&rsquo;ll come back to you. Or
                email <a href={`mailto:${contact.email}`}>{contact.email}</a>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap with-aside">
          <div>
            <h2>Send a message</h2>
            <p className="fine" style={{ maxWidth: "30rem" }}>
              Everything except your name, email and message is optional.
            </p>
            <ContactForm />
          </div>

          <aside>
            {!availability.open && (
              <div className="aside-block">
                <h3>Current availability</h3>
                <p>{availability.waitingListMessage}</p>
              </div>
            )}

            <div className="aside-block">
              <h3>Where</h3>
              <p>{contact.locations.join(" · ")}</p>
            </div>

            <div className="aside-block">
              <h3>When</h3>
              <p>{availability.hours}</p>
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

            {/* Counselling is not a crisis service, and saying where to go
                instead is more useful than an apology. */}
            <div className="aside-block">
              <h3>If you need help right now</h3>
              <p>
                I&rsquo;m not able to offer emergency support, and I may not see
                your message for a day or two. If you&rsquo;re in crisis or
                don&rsquo;t feel safe, please ring the Samaritans free on{" "}
                <a href="tel:116123">116 123</a>, any time of day or night, or
                NHS 111. In an emergency, ring 999.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
