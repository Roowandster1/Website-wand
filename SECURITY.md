# How the admin dashboard is secured

This system holds **special category personal data** under UK GDPR — health
information about named people. This document says plainly what is protected,
how, and what is *not* covered, so nobody has to guess.

---

## What protects what

| Layer | What it stops |
| ----- | ------------- |
| Password (scrypt, N=2¹⁶) | Guessing at scale. A stolen database gives no usable passwords. |
| Two-factor authentication (TOTP) | A stolen or phished password on its own. |
| Rate limiting + lockout | Brute force: 5 attempts per 15 minutes, then a 15-minute lock. |
| Server-side sessions | Session theft persisting. Sessions can be revoked instantly; a changed password signs out every device. |
| AES-256-GCM field encryption | A stolen database file, backup, or disk image revealing health data. |
| Passphrase-encrypted backups | Backups leaking if OneDrive is compromised. |
| Audit log | Silent access. Every sign-in and record view is recorded. |
| `no-store` + `noindex` on `/admin` | Records sitting in browser caches, proxies or search engines. |

## What is encrypted, and what deliberately isn't

**Encrypted at rest** (AES-256-GCM, key from `DATA_ENCRYPTION_KEY`):
health conditions, medication, allergies, contraindications, GP details,
general notes, appointment notes, and every treatment note.

**Stored in the clear:** names, phone numbers, email addresses, appointment
times, and payment amounts.

That second list is a deliberate trade-off, not an oversight. Search, the
diary and the income totals all need to query those fields, and encrypting
them would mean loading the whole database into memory for every search. The
sensitive judgement — *what is wrong with this person and what was done about
it* — is encrypted. A leaked database would reveal that someone is a client.
It would not reveal their medical history.

## The encryption key

`DATA_ENCRYPTION_KEY` is 32 random bytes, base64 encoded, held in the server's
environment and never written to the database.

**If this key is lost, every encrypted field is permanently unreadable.**
Losing it does not lose the diary or the income records, but it does lose the
entire clinical history. Store a copy somewhere separate from the server — a
password manager is ideal.

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Backups

The backup is **not** a copy of the database, on purpose. A copied database is
only readable if you still have `DATA_ENCRYPTION_KEY` — useless in exactly the
disaster it should protect against.

Instead the data is decrypted, gathered into JSON, and re-encrypted under a
passphrase chosen by the user. Given the file and the passphrase, the data can
be recovered with nothing else — no server, no app, no key. `scripts/decrypt-backup.mjs`
does this with plain Node.js and no dependencies. **Keep a copy of that script
wherever the backups live.**

## What this does NOT protect against

Being honest about the boundaries:

- **A compromised server.** Anyone with root on the host can read the key from
  the environment and decrypt everything. Encryption at rest protects a stolen
  disk or database file, not a live intrusion.
- **A compromised browser or an unlocked laptop.** A signed-in session is a
  signed-in session.
- **Malicious insiders.** The audit log records access; it does not prevent it.
- **Anything at the hosting provider level.** Use a reputable host, keep the OS
  patched, and enable full-disk encryption.

## Deployment must-dos

1. **HTTPS only.** Session cookies are marked `Secure` in production and will
   not be sent over plain HTTP. Every serious host provides a free certificate.
2. **Persistent disk.** SQLite needs one. Serverless platforms with ephemeral
   filesystems will silently lose data.
3. **Back up the volume too**, not just the in-app export.
4. **Set `DATA_ENCRYPTION_KEY`** as a secret, never in the repository.

## Reporting a problem

If you find a security issue, contact the site owner directly rather than
opening a public issue.
