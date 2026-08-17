import type { Metadata } from "next";
import Link from "next/link";
import { contact, privacy, site } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What personal information Elizabeth Wand holds, why she holds it, how " +
    "long for, who else sees it, and your rights over it.",
};

/**
 * The privacy notice.
 *
 * Required, not optional: the enquiry form on the contact page collects personal
 * data, and the practice holds health records, which UK GDPR treats as special
 * category data. The ICO expects a notice to be available at the point the data
 * is collected, which is why the enquiry form links straight here.
 *
 * The wording is drafted to match what this site and dashboard actually do —
 * cookieless analytics, encrypted clinical fields, an encrypted nightly backup.
 * If any of that changes, this page has to change with it.
 *
 * Everything Elizabeth has to decide for herself lives in `privacy` in
 * content/site.ts. While those are blank the page says so, in a box only she is
 * likely to understand the significance of — better a visible gap than a
 * confident sentence that isn't true.
 */
export default function PrivacyPage() {
  const missing: string[] = [];
  if (!privacy.retentionAdults) missing.push("how long records are kept");
  if (!privacy.lastUpdated) missing.push("the date this notice was last updated");
  const emailIsPlaceholder = contact.email.includes("example.com");
  if (emailIsPlaceholder) missing.push("a real email address to contact her on");

  return (
    <>
      <section className="wrap page-head">
        <p className="kicker">Privacy</p>
        <h1>How I look after your information</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          This applies both to people who simply visit this website and to people
          who come to me for counselling. It is written to be read, not to cover
          me.
        </p>
      </section>

      <section className="band">
        <div className="wrap">
          {missing.length > 0 && (
            <div
              className="note"
              style={{
                borderTopColor: "#c98a52",
                borderBottomColor: "#c98a52",
                marginBottom: "2.5rem",
              }}
            >
              <p className="kicker" style={{ color: "#a2652f" }}>
                Not finished yet
              </p>
              <p>
                This notice is still missing {missing.join(", ")}. Those are in{" "}
                <code>content/site.ts</code> under <code>privacy</code>. Until
                they are filled in, this page should not be treated as a
                published privacy notice.
              </p>
            </div>
          )}

          <div className="prose-wide">
            <h2>Who I am</h2>
            <p>
              I am {site.name}, {site.credentials}, a counsellor in private
              practice in {contact.locations.join(" and ")}. For the purposes of
              data protection law I am the data controller for the information
              described here — that means the decisions about what is held and
              why are mine, and I am accountable for them.
              {privacy.icoRegistration
                ? ` I am registered with the Information Commissioner's Office under reference ${privacy.icoRegistration}.`
                : ""}
            </p>
            <p>
              You can ask me anything about this notice, or make any of the
              requests described below, by emailing{" "}
              <a href={`mailto:${contact.email}`}>{contact.email}</a> or ringing{" "}
              <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a>.
            </p>

            <h2>If you are only visiting this website</h2>
            <p>
              This site sets no cookies and uses no advertising or third-party
              tracking. There is nothing to consent to, which is why you have not
              been asked to dismiss a banner.
            </p>
            <p>
              I do count page views, so I can tell which pages are worth keeping.
              That count records the page address, the date, roughly where in the
              world the request came from, and whether you arrived from a search
              engine or a link. It does not record your IP address, does not set
              an identifier, and cannot be linked back to you or joined up across
              visits. If your browser sends a &ldquo;do not track&rdquo; signal I
              do not count the visit at all.
            </p>
            <p>
              If you fill in the enquiry form I receive whatever you put in it —
              your name, your email address, your phone number if you give it,
              and your message. I use it to reply to you and for nothing else. I
              never sell it, and I do not add anyone to a mailing list.
            </p>
            <p>
              If you decide not to go ahead, tell me and I will delete your
              enquiry. If I do not hear from you I keep it for a year in case you
              come back, then delete it.
            </p>

            <h2>If you come to me for counselling</h2>
            <p>I hold:</p>
            <ul>
              <li>
                your name, contact details, date of birth, and the contact
                details of your GP and your next of kin if you give them;
              </li>
              <li>
                brief notes made after each session, and any relevant health
                information you have told me about — medication, diagnoses,
                anything that affects the work;
              </li>
              <li>a record of appointments, payments and cancellations;</li>
              <li>
                a record of the consent you gave, when, and what for.
              </li>
            </ul>
            <p>
              Notes are kept deliberately brief. They are a working record of the
              therapy, not a transcript of what you said.
            </p>

            <h2>Why I am allowed to hold it</h2>
            <p>
              Contact and appointment details are held because they are necessary
              to provide the counselling you have asked for — Article 6(1)(b) of
              the UK GDPR, performance of a contract.
            </p>
            <p>
              Notes and health information are what the law calls special
              category data, which needs a second, stronger justification. Mine
              is Article 9(2)(h): processing necessary for the provision of
              health or social care treatment. I also ask for your explicit
              consent at the start of the work, and you can withdraw it at any
              time.
            </p>

            <h2>Who else sees it</h2>
            <p>
              Almost nobody. Specifically:
            </p>
            <ul>
              <li>
                <strong>My clinical supervisor.</strong> Every accredited
                counsellor discusses their work in regular supervision — it is
                how the profession keeps itself safe and useful. I discuss the
                work, not your identity: no name, no details that would identify
                you. My supervisor is bound by the same confidentiality I am.
              </li>
              <li>
                <strong>Your insurer</strong>, but only if you are claiming
                through one, and only the dates and the fact that sessions took
                place. Not the content.
              </li>
              <li>
                <strong>The companies that host the website and carry my
                email.</strong> They store the data on my behalf, under contract,
                and are not permitted to use it for anything else.
              </li>
              <li>
                <strong>Somebody who can help</strong>, in the rare situation
                where there is a serious risk to your safety or someone
                else&rsquo;s, or where a court orders me to disclose. Wherever it
                is possible to do so, I will talk to you about it first.
              </li>
            </ul>
            <p>
              Nobody else — not your family, not your GP, not your employer —
              sees anything without your agreement.
            </p>

            <h2>How it is kept</h2>
            <p>
              Records are held in a private system that only I can sign in to,
              protected by a password and a second code from my phone. The
              clinical parts of a record — notes, health information, anything
              you have told me in confidence — are encrypted, so they are
              unreadable even to somebody who obtained a copy of the underlying
              file.
            </p>
            <p>
              A backup is taken every night and encrypted before it leaves the
              machine, so that a failure cannot lose your record and a stolen
              backup cannot reveal it.
            </p>

            <h2>How long I keep it</h2>
            {privacy.retentionAdults ? (
              <p>
                I keep client records for {privacy.retentionAdults} after our
                last session
                {privacy.retentionUnder18
                  ? `, and for anyone I saw under the age of 18, until their ${privacy.retentionUnder18}`
                  : ""}
                . After that they are destroyed. I cannot keep them indefinitely
                just in case, and I am not permitted to destroy them the moment
                you stop coming — insurers and my professional body both require
                a minimum period.
              </p>
            ) : (
              <p>
                <em>
                  This section is not finished. It needs the retention period
                  from her insurer&rsquo;s policy wording.
                </em>
              </p>
            )}

            <h2>Your rights</h2>
            <p>You can ask me to:</p>
            <ul>
              <li>
                <strong>show you what I hold</strong> about you, and give you a
                copy — free, and normally within one month;
              </li>
              <li>
                <strong>correct anything that is wrong</strong>, including
                anything you feel I have recorded inaccurately;
              </li>
              <li>
                <strong>delete it</strong>, though I may have to keep some of it
                for the retention period above, and I will tell you plainly if
                that applies;
              </li>
              <li>
                <strong>restrict or stop</strong> what I do with it;
              </li>
              <li>
                <strong>give you a portable copy</strong> to take elsewhere;
              </li>
              <li>
                <strong>withdraw your consent</strong>, at any time, without
                having to give a reason.
              </li>
            </ul>
            <p>
              Nothing about you is subject to automated decision-making or
              profiling. No decision about your care is made by a computer.
            </p>

            <h2>If you are unhappy</h2>
            <p>
              Please tell me first — most things are a misunderstanding and I
              would rather fix it. If that does not resolve it, you can complain
              to the Information Commissioner&rsquo;s Office, the UK regulator,
              at{" "}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                rel="noopener noreferrer"
                target="_blank"
              >
                ico.org.uk/make-a-complaint
              </a>{" "}
              or on 0303 123 1113. You can also raise a concern about my practice
              with the British Association for Counselling and Psychotherapy,
              whose accredited register I am on.
            </p>

            {privacy.lastUpdated && (
              <p className="fine">Last updated: {privacy.lastUpdated}.</p>
            )}
          </div>

          <div className="actions">
            <Link className="cta-link" href="/contact">
              Any questions? Get in touch
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
