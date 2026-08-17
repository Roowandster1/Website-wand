# Going live

Everything left to do, in the order to do it. Nothing here is code — the site is
built. This is accounts, decisions and four pieces of text.

**The dashboard checks most of this for you.** Sign in and go to **Settings** →
*Before the site goes live*. It reads the running server, so it always shows what
is actually configured rather than what a document claims.

---

## 0. First, protect what already exists

**Do this before anything else, because it is the only step that can lose data.**

If the dashboard has been deployed on Railway without a volume, the database is
inside the container and **every client record is deleted on the next deploy** —
silently, with no error.

1. Railway → your service → **Variables** tab → **New Volume**
2. Mount path: `/data`
3. Add a variable: `DATABASE_PATH` = `/data/practice.db`
4. Redeploy

To confirm: Settings → *Before the site goes live* → the storage line should read
**"Database is on separate storage"**. If it says *may not survive a redeploy*,
the volume is not attached.

If real client records have already been entered without a volume, export a
backup from Settings **first**, then attach the volume, then restore.

---

## 1. Decide the web address

Two options, and this determines the answer to step 3.

| | Address | Cost | Notes |
| --- | --- | --- | --- |
| **Railway subdomain** | `something.up.railway.app` | free | Works today. Fine to start with, but it doesn't look like a practice. |
| **Own domain** | `elizabethwand.co.uk` | ~£10–15/year | What a private practice should have. |

For a domain: buy it from any registrar, then Railway → **Settings** →
**Networking** → *Custom Domain*, and add the CNAME record it gives you at the
registrar. HTTPS is automatic and required — session cookies are `Secure` in
production and won't be sent over plain HTTP.

---

## 2. Get an email address for the practice

The site currently tells people to email `hello@example.com`, which is a
placeholder I refused to replace with a guess.

A personal Gmail works, but `elizabeth@elizabethwand.co.uk` reads better and
comes free with most domain purchases, or £4-ish a month via Google Workspace.

Whichever it is, it needs to be an address she will actually check.

---

## 3. Send me four pieces of text

These are the only things I cannot work out or generate myself. Reply with:

1. **The web address** from step 1 — e.g. `https://elizabethwand.co.uk`
2. **Her email address** from step 2
3. **The retention period** — how long client records are kept after the last
   session. **Ask her insurer**; their policy wording states a minimum and that
   minimum is the answer. For UK counselling it is commonly 7 years for adults,
   and until their 25th birthday for anyone seen under 18. Don't guess: the
   privacy notice will state this as a promise.
4. **Her BACP membership number**, if she wants the site to link to her entry on
   the BACP register. Optional, but it is the one claim on the page a stranger
   can independently verify.

I'll put them in and push. Five minutes.

**Do not send me:** the encryption key, the backup passphrase, or any password.
Those belong only on the server — anything pasted into a chat stays in its
transcript.

---

## 4. Two things she does herself, in the dashboard

Sign in at `/admin` (there's a **Practice login** link in the site footer).

- **Turn on two-factor authentication** — Settings → Two-factor authentication.
  Needs a phone with an authenticator app. This is the single biggest thing
  standing between a phished password and a stranger reading health records.
- **Take a backup** and save the passphrase somewhere **physical**. Written on
  paper in a drawer is genuinely fine. Lose it and the backups are unreadable.

---

## 5. Register with the ICO

Holding health records on a computer means she is almost certainly required to
register as a data controller and pay the annual data protection fee — **£40–£60**
for a practice this size.

Check and register: <https://ico.org.uk/registration/>

Then send me the reference number and I'll add it to the privacy notice, which is
where people expect to find it.

---

## 6. Optional: switch on appointment reminders

Reminders and the nightly backup email currently do nothing, and do it quietly,
because no mail server is configured.

To switch them on, set these on Railway under **Variables**:

```
SMTP_HOST      smtp.gmail.com          (or whatever the provider gives)
SMTP_PORT      587
SMTP_USER      the mailbox address
SMTP_PASS      an app password, not the account password
SMTP_FROM      "Elizabeth Wand" <elizabeth@…>
```

Gmail needs an *app password* generated in the Google account's security
settings; the normal password will be rejected.

Reminders go out at 6pm the day before, and say when the appointment is and
nothing else — no session type, no reason for the visit.

---

## 7. The last switch: let search engines in

**Only when every "needed" line in the dashboard checklist is green.**

Railway → **Variables** → add:

```
NEXT_PUBLIC_ALLOW_INDEXING = 1
```

Redeploy. `robots.txt` stops blocking, and the sitemap and structured data start
doing their job.

This is deliberately last. Getting a half-finished page **out** of Google is far
more work than not putting it there — which is why the site has been blocked from
indexing this whole time.

Afterwards, add the site to
[Google Search Console](https://search.google.com/search-console) and submit
`https://your-address/sitemap.xml`. That is what actually gets it found, rather
than waiting to be discovered.

---

## 8. Tell people

The share card is already built, so pasting the address into WhatsApp, Facebook
or iMessage shows her name, accreditation and photograph rather than a grey box.

Worth updating with the new address: her existing directory profiles
(Counselling Directory, Psychology Today, BACP), and anywhere she's already
listed.

---

## Still unfinished, and honestly so

These do not block going live, but you should know they're outstanding:

- **The OneDrive backup is untested.** I built it but had no Microsoft account to
  test against, so it is the one part of this project I can't say works. The
  local encrypted backup and the emailed one are both verified.
- **Team invites** — the schema is there, the invite screen isn't. Fine while
  she's the only person using it.
- **Documents** — marked "soon" in the sidebar. Intake forms and letters have
  nowhere to live yet.
- **A better photograph.** The one on file is 400 × 400, which caps how large it
  can be shown. A higher-resolution portrait could run much bigger.

---

## If a deploy fails

Read the Railway log and find the stage that broke.

| In the log | Cause | Fix |
| --- | --- | --- |
| `Unsupported engine`, Node version error | Builder picked an old Node | `engines` and `.nvmrc` pin ≥20.9 — redeploy |
| `gyp` / `node-gyp` / `better-sqlite3` error | Native module built without a toolchain | Make sure it's building from the `Dockerfile`, not Nixpacks |
| `getaddrinfo ENOTFOUND <container id>` | Server bound to the wrong host | Already fixed: the container forces `HOSTNAME=0.0.0.0` |
| `failed to calculate checksum … /public` | Missing folder in the image | Already fixed: `public/.gitkeep` is committed |
| Deploy succeeds, data disappears later | **No volume** | Step 0 |

`GET /api/health/` reports what the server thinks of itself:
`{"status":"ok","serving":true,"databaseWritable":true,"warnings":[]}`. It is
**not** wired up as a deploy gate — a misconfigured app that starts and explains
itself is more useful than a deploy that fails with no page to read. Anything
wrong shows up in the dashboard checklist and in `warnings`.
