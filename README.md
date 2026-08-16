# Willow & Thyme

Two things in one project:

1. **A public website** — home, treatments, about and contact.
2. **A private admin dashboard** at `/admin` — clients, diary, treatment notes,
   payments and encrypted backups.

Built with Next.js and SQLite. One app, one deploy, one file to back up.

> **Everything in here is placeholder.** The business name, the therapist, the
> treatments, the prices and all three testimonials are invented. Anything
> marked `‹‹ CHANGE ME ››` in `content/site.ts` needs replacing before this is
> shown to anyone.

---

## The website

All the public content lives in one file: **[`content/site.ts`](content/site.ts)**.
Edit the text between the `'quote marks'`, save, and the site updates.

| What to change | Where |
| --- | --- |
| Business name, tagline | `site` |
| Phone, email, address, socials | `contact` |
| Opening hours | `hours` |
| Treatments, prices, descriptions | `treatments` |
| Client quotes | `testimonials` |
| About page and qualifications | `about` |

The treatments listed there also become the options in the booking form, so the
diary and the website can't drift apart.

### The contact form

Out of the box it opens the visitor's own email app with the message written
out — works immediately, costs nothing, but some people won't press send. For
properly emailed enquiries, make a free form at [formspree.io](https://formspree.io)
and paste the URL into `formEndpoint` in `content/site.ts`. It switches over on
its own.

---

## The admin dashboard

Go to `/admin`. The first visit asks you to create an account; after that the
setup page seals itself and cannot be used again.

- **Today** — what's booked, what's owed, income so far
- **Diary** — week view, booking, double-booking prevention
- **Clients** — records, health information, treatment notes, consent, archiving
- **Payments** — what's been paid, what's outstanding, yearly totals
- **Settings** — two-factor authentication, password, backups, activity log

### Two things to do on day one

1. **Turn on two-factor authentication** (Settings). It's the single biggest
   thing standing between a phished password and a stranger reading health
   records.
2. **Take a backup**, and save the passphrase somewhere physical.

### Backups

Settings → Backup downloads everything as one encrypted file. Save it into a
OneDrive folder and it syncs and versions itself from there.

The file is encrypted with a passphrase you choose. **If you lose that
passphrase, nobody can open the backup — not Microsoft, not the person who
built this.** That is the point, and it's also the risk.

To read a backup without this app at all:

```bash
node scripts/decrypt-backup.mjs practice-backup-2026-08-16.json
```

Plain Node.js, no dependencies. Keep a copy of that script with your backups.

---

## Running it on your own computer

Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# paste that into DATA_ENCRYPTION_KEY in .env.local
npm run dev
```

Then open <http://localhost:3000>. The database creates itself at `data/practice.db`
on first run.

---

## Putting it online

The admin dashboard needs a real server — it has sessions, a database and
encryption. This is no longer a static site, so free static hosts (GitHub
Pages, plain Netlify) will not work.

**Requirements:**

- A host with a **persistent disk** for the SQLite file — Fly.io, Railway,
  Render, or any small VPS. Serverless platforms with ephemeral filesystems
  will silently lose data.
- **HTTPS.** Session cookies are `Secure` in production and won't be sent over
  plain HTTP. Every serious host provides a free certificate.
- `DATA_ENCRYPTION_KEY` set as a secret.
- `DATABASE_PATH` pointing at the mounted volume.

A `Dockerfile` is included and expects a volume at `/data`. Expect £5–10/month
for something of this size.

Back up the volume as well as taking in-app exports — they protect against
different things.

---

## Security and the law

Two documents worth reading properly, not skimming:

- **[SECURITY.md](SECURITY.md)** — what's encrypted, what isn't and why, what
  the key does, and what none of this protects against.
- **[docs/legal-obligations.md](docs/legal-obligations.md)** — ICO
  registration, lawful basis, retention periods, subject access requests, and
  the 72-hour breach rule.

The short version: this holds health data, which UK GDPR treats as special
category data. The software handles the technical duty of care. Registration,
a privacy notice, a written retention policy and checking the website's claims
are all still yours to do.

---

## Layout

```
app/
  (site)/            The public website
  admin/
    login/ setup/    Sign-in and first-run (no session needed)
    (protected)/     Everything requiring a session — the auth boundary
  globals.css        Public styling; colours defined at the top
components/          Public components, plus components/admin/
content/site.ts      ← all editable website content
lib/
  crypto.ts          AES-256-GCM field encryption
  auth.ts            Passwords, sessions, lockout
  totp.ts            Two-factor codes
  db.ts              SQLite schema and migrations
  backup.ts          Encrypted export
scripts/
  decrypt-backup.mjs Standalone backup reader
```

Colours, fonts and spacing are CSS variables at the top of `app/globals.css`.
Change `--clay` and every button, link and accent changes together.
