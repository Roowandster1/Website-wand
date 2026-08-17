import "server-only";

/**
 * Configuration problems worth telling the user about in the dashboard itself.
 *
 * A missing encryption key or an unwritable database does not stop the site
 * serving, so it must not be hidden in a deploy log nobody will read again.
 * This is surfaced at the top of every admin page instead.
 */
export type ConfigProblem = { title: string; detail: string };

/**
 * Why health information cannot be saved right now, or null if it can.
 *
 * Checked before any write that encrypts, so a server that has not been given
 * its key explains itself instead of throwing a stack trace at whoever is
 * typing. Everything that does not touch health data keeps working.
 */
export function encryptionUnavailable(): string | null {
  const key = process.env.DATA_ENCRYPTION_KEY;

  if (!key) {
    return (
      "Health information can't be saved yet because the encryption key " +
      "(DATA_ENCRYPTION_KEY) hasn't been set on the server. Everything else " +
      "works — you can still add names, contact details and appointments."
    );
  }
  if (Buffer.from(key, "base64").length !== 32) {
    return (
      "Health information can't be saved because the encryption key is the " +
      "wrong length. It needs to be exactly 32 random bytes, base64 encoded."
    );
  }
  return null;
}

export function configProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key) {
    problems.push({
      title: "The encryption key is not set",
      detail:
        "Health information and treatment notes cannot be saved until " +
        "DATA_ENCRYPTION_KEY is set on the server. It must be 32 random bytes, " +
        "base64 encoded. Everything else works in the meantime.",
    });
  } else if (Buffer.from(key, "base64").length !== 32) {
    problems.push({
      title: "The encryption key is the wrong length",
      detail:
        `DATA_ENCRYPTION_KEY decodes to ${Buffer.from(key, "base64").length} bytes; ` +
        "it needs to be exactly 32. Generate a fresh one and set it again.",
    });
  }

  if (!process.env.BACKUP_PASSPHRASE) {
    problems.push({
      title: "Automatic backups are switched off",
      detail:
        "No nightly backup is being taken because BACKUP_PASSPHRASE is not set. " +
        "You can still take one by hand from this page.",
    });
  }

  return problems;
}
