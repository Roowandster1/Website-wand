# Elizabeth Wand — Counselling

Two things in one project:

1. **A public website** — home, how I work, about and contact.
2. **A private admin dashboard** at `/admin` — clients, diary, session notes,
   payments and encrypted backups.

Built with Next.js and SQLite. One app, one deploy, one file to back up.

> **Two things still need filling in before this goes live.** Search
> `content/site.ts` for `‹‹ CHECK ››`: the site's real web address (`site.url`)
> and Elizabeth's email address (`contact.email`). Everything else is her own
> wording, taken from her existing profile. Search engines stay blocked until
> `NEXT_PUBLIC_ALLOW_INDEXING=1` is set, so an unfinished page can't get indexed.

---

## The website

All the public content lives in one file: **[`content/site.ts`](content/site.ts)**.
Edit the text between the `'quote marks'`, save, and the site updates.

| What to change | Where |
| --- | --- |
| Name, credentials, tagline | `site` |
| Taking new clients, or on a waiting list | `availability` |
| Phone, email, areas, socials | `contact` |
| Fee, session length, insurers | `fees` |
| In person / online / phone | `sessionTypes` |
| The "About" wording | `about` |
| Training, memberships, DBS | `qualifications` |
| Approaches drawn on | `therapies` |
| The neurodivergence section | `neurodivergence` |
| The list of things worked with | `areasOfCounselling` |
| Supervision for other counsellors | `supervision` |
| Session types offered in the diary | `treatments` |

Two of those do more than print words:

- **`availability.open`** — set it to `false` and a waiting-list notice appears on
  the home, how-I-work and contact pages. Set it to `true` when there's space
  again and the notices disappear on their own.
- **`treatments`** — these become the options in the enquiry form *and* in the
  admin diary, so the website and the diary can't drift apart.

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
- **Diary** — week view, booking, recurring appointments, double-booking prevention
- **Clients** — records, health information, treatment notes, consent, archiving
- **Payments** — what's been paid, what's outstanding, yearly totals
- **Reports** — what earns most, who's drifted away, website visitors
- **Settings** — two-factor authentication, password, backups, activity log

### Two things to do on day one

1. **Turn on two-factor authentication** (Settings). It's the single biggest
   thing standing between a phished password and a stranger reading health
   records.
2. **Take a backup**, and save the passphrase somewhere physical.

### Repeating appointments

When booking, choose weekly, fortnightly or every four weeks and how many
altogether. The whole series goes in on the same weekday at the same time.

Any week that clashes with something already booked is **skipped and reported
back**, never silently double-booked. Editing one appointment affects only that
one; there's a separate button to cancel a series from a given date onwards.

### Automatic nightly backup

Set `BACKUP_PASSPHRASE` and a backup runs every night at 2:30am, encrypted,
saved to disk and — if configured — uploaded to OneDrive and emailed.

Every run is recorded, including failures. If no backup has succeeded in two
days, Settings says so in a warning, because a backup that quietly stopped
working is worse than none at all: you think you have one.

If `BACKUP_PASSPHRASE` isn't set, no automatic backup is taken. It will never
fall back to writing an unencrypted copy of client health records to disk.

For OneDrive uploads, run this once and follow the instructions it prints:

```bash
npm run onedrive-setup
```

It uses Microsoft's device-code sign-in and only ever gets access to the app's
own folder — never the rest of her OneDrive.

### Appointment reminders

With SMTP configured, clients get an email at 6pm the evening before.

The message says **when and where, and nothing else**. No treatment name, no
reason for the visit — an email preview on a lock screen or in a shared family
inbox shouldn't disclose that someone is having therapy. Any client can be
opted out on their record.

### Backups you can read without this app

Settings → Backup also downloads everything on demand as one encrypted file.

The file is encrypted with a passphrase you choose. **If you lose that
passphrase, nobody can open the backup — not Microsoft, not the person who
built this.** That is the point, and it's also the risk.

To read any backup without this app at all:

```bash
node scripts/decrypt-backup.mjs practice-backup-2026-08-16.json
```

Plain Node.js, no dependencies. Keep a copy of that script with your backups.

### Website analytics without a consent banner

The Insights page shows page views, which pages get read, where visitors came
from and how many are on a phone.

There is **no Google Analytics and no third-party script**. Views are counted
by the site's own server into the same database, with no cookies, no IP
addresses and nothing that could identify a person or link two visits. That's
what keeps it outside the consent rules — and it's still enough to answer "is
anyone actually reading the how-I-work page?".

The honest limitation: with no identifiers there's no true "unique visitors"
figure. Views are views. Obvious bots are filtered out; Do Not Track is
honoured.

### Signed out when idle

After 20 minutes without activity the session ends and client records leave the
screen — the realistic risk isn't a hacker, it's a laptop left open in the
treatment room. A warning appears a minute beforehand. Change it with
`IDLE_TIMEOUT_MINUTES`.

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

### Railway, step by step

`railway.json` is committed and tells Railway to build from the `Dockerfile`
rather than guess. **Do all four of these** — three of them are the usual causes
of a failed deploy:

1. **Add a volume.** Railway → your service → *Variables* → *New Volume*, mount
   path `/data`. Without it the app still starts, but every client record
   vanishes on the next deploy or restart.
2. **Set the secrets** under *Variables*:
   ```
   DATA_ENCRYPTION_KEY   (32 random bytes, base64 — see .env.example)
   BACKUP_PASSPHRASE     (12+ characters, for the nightly backup)
   ```
   `DATABASE_PATH` and `BACKUP_DIR` already default to `/data` in the Dockerfile.
3. **Leave `PORT` alone.** Railway injects it; the container binds to it on
   `0.0.0.0`. Overriding it usually breaks the healthcheck.
4. **Generate a domain** (*Settings* → *Networking*). Railway gives you HTTPS,
   which the app needs — session cookies are `Secure` in production and will not
   be sent over plain HTTP.

**If the deploy fails, read the log for which stage broke:**

| Symptom in the log | Cause | Fix |
| --- | --- | --- |
| `Unsupported engine` / Node version error | Builder picked an old Node | `engines` and `.nvmrc` now pin ≥20.9 — redeploy |
| `gyp` / `node-gyp` / `better-sqlite3` build error | Native module compiled without a toolchain | Make sure it's building from the `Dockerfile`, not Nixpacks |
| Healthcheck timeout, app otherwise fine | Healthcheck hitting a redirect | Path must be `/api/health/` **with** the trailing slash |
| `{"status":"not ready","problems":[...]}` | App started but is misconfigured | The `problems` list names exactly what's missing |
| Deploy succeeds, data disappears later | No volume attached | Add the `/data` volume (step 1) |

`GET /api/health/` is a readiness check that fails the deploy rather than
letting a misconfigured app take traffic. It confirms the database is writable
and the encryption key is present and valid, and returns the reason when either
isn't. It never returns client data.

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
  api/collect/       Cookieless page-view beacon
  globals.css        Public styling; colours defined at the top
components/          Public components, plus components/admin/
content/site.ts      ← all editable website content
instrumentation.ts   Starts the background jobs on server boot
lib/
  crypto.ts          AES-256-GCM field encryption
  auth.ts            Passwords, sessions, lockout, idle expiry
  totp.ts            Two-factor codes
  db.ts              SQLite schema and migrations
  backup.ts          Encrypted export
  auto-backup.ts     The nightly job, retention and delivery
  reminders.ts       Reminder emails
  scheduler.ts       Cron registration
  analytics.ts       Practice insights
  pageviews.ts       Website analytics
scripts/
  decrypt-backup.mjs Standalone backup reader
  onedrive-setup.mjs One-off OneDrive sign-in
```

Colours, fonts and spacing are CSS variables at the top of `app/globals.css`.
Change `--clay` and every button, link and accent changes together.
