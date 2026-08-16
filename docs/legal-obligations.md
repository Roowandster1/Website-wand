# What the law asks of you, beyond the software

The dashboard handles the technical side of protecting client data. It cannot
handle the paperwork side, and the paperwork side is most of the obligation.

None of this is legal advice — it's a starting checklist. Your insurer and your
professional body will both have their own requirements, and theirs are the
ones that matter in practice.

---

## 1. Register with the ICO

A sole practitioner keeping computerised health records almost certainly needs
to register with the Information Commissioner's Office and pay the annual data
protection fee. For most small practices this is **£52 a year**.

Check with their self-assessment: <https://ico.org.uk/for-organisations/data-protection-fee/>

Not registering when you should have is itself an offence, separate from
anything to do with a breach.

## 2. Write down your lawful basis

Health data is "special category" data under UK GDPR Article 9, which needs
**two** things: a lawful basis under Article 6, and a separate condition under
Article 9.

For a therapy practice this is usually:
- **Article 6(1)(b)** — processing necessary for a contract (providing treatment)
- **Article 9(2)(h)** — provision of health or social care treatment

Explicit consent (9(2)(a)) is often used as well. The dashboard records consent
per client, with the date and how it was given, on the client record.

## 3. Have a privacy notice

Clients are entitled to know what you hold, why, how long for, and what rights
they have. A single side of A4 given at the first appointment is enough for a
practice this size. The ICO publishes a template for small organisations.

The website has no privacy page yet — **that is a gap worth closing** before
the contact form goes live, since the form itself collects personal data.

## 4. Decide your retention period, and write it down

You cannot keep records forever "just in case", and you cannot bin them the
moment someone stops coming.

Common practice for complementary therapists, and what most insurers require:
- **Adults:** 7–8 years after the last treatment
- **Children:** until their 25th birthday
- Check your own insurer's policy wording — it will state a minimum.

The dashboard's **Archive** button is built for exactly this: it hides a record
from the active list while preserving the clinical history. Permanent deletion
is available but separate, and deliberately harder to reach.

## 5. Know what to do about requests

- **Subject access request** — someone asks for a copy of everything you hold.
  You have one month, and you cannot charge. The activity log on the Settings
  page lets you answer "who has seen my notes?" honestly.
- **Erasure request** — someone asks you to delete their records. This right is
  **not absolute**: where you have a legal or insurance obligation to retain
  clinical notes, you can refuse and explain why. Say so in writing.

## 6. Breach notification: 72 hours

If personal data is lost, stolen, or exposed and it poses a risk to the people
involved, you must tell the ICO **within 72 hours** of becoming aware. If the
risk is high, you must tell the affected clients too.

Worth knowing in advance rather than looking it up in a panic:
<https://ico.org.uk/for-organisations/report-a-breach/>

## 7. Check the website's claims

The public site describes treatments and what they help with. Two things to
verify before it goes live:

- **Qualifications and insurance.** The placeholder text claims specific
  diplomas, insurance and DBS clearance. Every one of those must be true.
- **Therapeutic claims.** Saying a treatment helps with a named condition is a
  claim the ASA can act on, and one your insurer may care about. Keep the
  language to how people commonly feel afterwards rather than promising
  outcomes.

## 8. Practical habits that matter more than they sound

- Full-disk encryption on the laptop she uses (FileVault on a Mac, BitLocker on
  Windows). Both are free and already on the machine.
- A password manager, so the login password is unique to this system.
- Lock the screen when leaving the room. A signed-in session is a signed-in
  session.
- Take a backup regularly, and **test restoring one at least once**. An
  untested backup is a hope, not a backup.
