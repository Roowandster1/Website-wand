import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { backupIsStale } from "./auto-backup";
import { contact, privacy, site } from "@/content/site";
import "server-only";

/**
 * The go-live checklist, worked out from the running server rather than from a
 * document somebody has to keep in step.
 *
 * Shown on the Settings page so the question "what is left before this can go
 * live?" has one answer, in plain English, that is always current. Some of it is
 * Elizabeth's to do and some is the server's; each item says which.
 */

export type CheckStatus = "done" | "todo" | "later";

export type Check = {
  id: string;
  title: string;
  status: CheckStatus;
  /** What to do about it, or what it means that it's done. */
  detail: string;
  /** True when the site should not be published until this is dealt with. */
  blocking: boolean;
};

function keyLooksRight(): boolean {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key) return false;
  try {
    return Buffer.from(key, "base64").length === 32;
  } catch {
    return false;
  }
}

/**
 * Whether the database looks like it's on storage that survives a redeploy.
 *
 * This is a heuristic and says so. A container host gives the app a fresh
 * filesystem on every deploy, so a database inside the app's own folder is
 * deleted each time — silently, which is the worst way to lose client records.
 * A mounted volume is somewhere else on disk entirely, so a path outside the
 * working directory is the signal we can actually check for.
 */
function databasePersistence(): Check {
  const configured = process.env.DATABASE_PATH ?? "./data/practice.db";
  const full = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  const insideApp = full.startsWith(resolve(process.cwd()) + "/");

  // Running from a local checkout is fine — the risk is specific to hosts that
  // rebuild the filesystem, and there the app is not run from a git clone.
  const looksLikeAContainer = existsSync("/.dockerenv");

  if (insideApp && looksLikeAContainer) {
    return {
      id: "storage",
      title: "The database may not survive a redeploy",
      status: "todo",
      blocking: true,
      detail:
        `The database is at ${full}, which is inside the app's own folder. On a ` +
        "host like Railway or Fly that folder is rebuilt on every deploy, so " +
        "every client record would be deleted without warning. Attach a volume " +
        "mounted at /data and set DATABASE_PATH=/data/practice.db.",
    };
  }

  return {
    id: "storage",
    title: insideApp
      ? "Database is in the project folder (fine for a local copy)"
      : "Database is on separate storage",
    status: "done",
    blocking: true,
    detail: insideApp
      ? `Stored at ${full}. That's expected when you're running it on your own ` +
        "computer. On a hosted server it must be a mounted volume instead."
      : `Stored at ${full}, outside the app folder — so a redeploy won't touch it. ` +
        "Back the volume up as well as taking exports: they protect against " +
        "different things.",
  };
}

export function goLiveChecks(options: {
  twoFactorEnabled: boolean;
}): Check[] {
  const checks: Check[] = [];

  /* --- The server ------------------------------------------------------- */

  checks.push({
    id: "encryption",
    title: keyLooksRight()
      ? "Encryption key is set"
      : "Encryption key is missing or wrong",
    status: keyLooksRight() ? "done" : "todo",
    blocking: true,
    detail: keyLooksRight()
      ? "Notes, health information and timeline detail are encrypted before " +
        "they touch the disk."
      : "Set DATA_ENCRYPTION_KEY on the server to 32 random bytes, base64 " +
        "encoded. Until then nothing confidential can be saved at all. Keep a " +
        "copy somewhere safe — lose it and the notes are unreadable for good.",
  });

  checks.push(databasePersistence());

  const hasPassphrase = Boolean(process.env.BACKUP_PASSPHRASE);
  checks.push({
    id: "backups",
    title: hasPassphrase
      ? backupIsStale()
        ? "Backups are configured but none has run recently"
        : "Nightly encrypted backup is running"
      : "Nightly backups are switched off",
    status: hasPassphrase && !backupIsStale() ? "done" : "todo",
    blocking: false,
    detail: hasPassphrase
      ? backupIsStale()
        ? "A backup that has quietly stopped is worse than none, because you " +
          "think you have one. Run one by hand from this page and read the " +
          "reason if it fails."
        : "Encrypted with BACKUP_PASSPHRASE before it leaves the machine. Keep " +
          "that passphrase written down somewhere physical."
      : "Set BACKUP_PASSPHRASE on the server to switch them on. You can still " +
        "take one by hand from this page in the meantime.",
  });

  const smtp = Boolean(process.env.SMTP_HOST);
  checks.push({
    id: "email",
    title: smtp ? "Email sending is configured" : "Email sending is not set up",
    status: smtp ? "done" : "todo",
    blocking: false,
    detail: smtp
      ? "Appointment reminders and the nightly backup email can be delivered."
      : "Without SMTP_HOST, appointment reminders and backup emails do nothing " +
        "— and do it quietly. Everything else works. Set the SMTP details when " +
        "you want reminders going out.",
  });

  checks.push({
    id: "twofactor",
    title: options.twoFactorEnabled
      ? "Two-factor authentication is on"
      : "Two-factor authentication is off",
    status: options.twoFactorEnabled ? "done" : "todo",
    blocking: true,
    detail: options.twoFactorEnabled
      ? "A stolen password isn't enough to open a client record."
      : "You're holding health records. This is the single biggest thing " +
        "standing between a phished password and a stranger reading them. " +
        "Turn it on below — it takes about a minute.",
  });

  /* --- The website's own details ---------------------------------------- */

  const urlSet = !site.url.includes("example.com");
  checks.push({
    id: "url",
    title: urlSet ? "Web address is set" : "Web address is still a placeholder",
    status: urlSet ? "done" : "todo",
    blocking: true,
    detail: urlSet
      ? `The site knows it lives at ${site.url}.`
      : "site.url in content/site.ts still says example.com. It's used for the " +
        "sitemap, the share preview and the search-engine markup, so all three " +
        "are wrong until it's the real address.",
  });

  const emailSet = !contact.email.includes("example.com");
  checks.push({
    id: "contact-email",
    title: emailSet
      ? "Contact email is set"
      : "Contact email is still a placeholder",
    status: emailSet ? "done" : "todo",
    blocking: true,
    detail: emailSet
      ? `Enquiries reach ${contact.email}.`
      : "The website currently tells people to email hello@example.com. Set " +
        "contact.email in content/site.ts.",
  });

  const privacyDone = Boolean(privacy.retentionAdults && privacy.lastUpdated);
  checks.push({
    id: "privacy",
    title: privacyDone
      ? "Privacy notice is complete"
      : "Privacy notice is unfinished",
    status: privacyDone ? "done" : "todo",
    blocking: true,
    detail: privacyDone
      ? `Published, with records kept for ${privacy.retentionAdults} after the ` +
        "last session."
      : "The notice needs the retention period from your insurer's policy " +
        "wording, and a last-updated date. Both are in the privacy section of " +
        "content/site.ts. The enquiry form collects personal data, so this has " +
        "to be right before the site is public.",
  });

  /* --- Last, and only once the rest are green ---------------------------- */

  const indexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";
  const everythingElseReady = checks.every(
    (check) => !check.blocking || check.status === "done",
  );

  checks.push({
    id: "indexing",
    title: indexing
      ? "Search engines are allowed in"
      : "Search engines are still blocked",
    status: indexing ? "done" : everythingElseReady ? "todo" : "later",
    blocking: false,
    detail: indexing
      ? "robots.txt allows crawling. The site is findable."
      : everythingElseReady
        ? "Everything above is done, so this is the last switch: set " +
          "NEXT_PUBLIC_ALLOW_INDEXING=1 on the server and redeploy."
        : "Deliberately last. Leave this off until the items above are green — " +
          "getting a half-finished page out of Google is far more work than " +
          "not putting it there.",
  });

  return checks;
}

/** Is the site ready to be made public? */
export function readyToGoLive(checks: Check[]): boolean {
  return checks.every((check) => !check.blocking || check.status === "done");
}
