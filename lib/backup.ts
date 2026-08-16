import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { decrypt } from "./crypto";
import { getDb } from "./db";
import "server-only";

/**
 * Encrypted backup export.
 *
 * The backup is deliberately NOT a copy of the database file. A copied
 * database is only readable if you also still have DATA_ENCRYPTION_KEY — which
 * makes it useless in exactly the disaster it is meant to protect against.
 *
 * Instead the whole dataset is decrypted, gathered into JSON, and re-encrypted
 * under a passphrase she chooses and knows. The result is self-contained: given
 * the file and the passphrase, the data can be recovered with nothing else —
 * not this app, not the server, not the original key. `scripts/decrypt-backup.mjs`
 * does exactly that with plain Node and no dependencies.
 */

const BACKUP_VERSION = 1;
const SCRYPT_PARAMS = { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 2 ** 16 * 8 * 2 };

export type BackupBundle = {
  version: number;
  exportedAt: string;
  clients: unknown[];
  appointments: unknown[];
  treatmentNotes: unknown[];
  payments: unknown[];
};

/** Reads everything out of the database, decrypting the clinical fields. */
export function gatherBackup(): BackupBundle {
  const db = getDb();

  const clients = (
    db.prepare("SELECT * FROM clients ORDER BY id").all() as Array<
      Record<string, unknown>
    >
  ).map((row) => ({
    ...row,
    notes: decrypt(row.notes_enc as string),
    health_conditions: decrypt(row.health_conditions_enc as string),
    medications: decrypt(row.medications_enc as string),
    allergies: decrypt(row.allergies_enc as string),
    contraindications: decrypt(row.contraindications_enc as string),
    gp_details: decrypt(row.gp_details_enc as string),
    notes_enc: undefined,
    health_conditions_enc: undefined,
    medications_enc: undefined,
    allergies_enc: undefined,
    contraindications_enc: undefined,
    gp_details_enc: undefined,
  }));

  const appointments = (
    db.prepare("SELECT * FROM appointments ORDER BY id").all() as Array<
      Record<string, unknown>
    >
  ).map((row) => ({
    ...row,
    notes: decrypt(row.notes_enc as string),
    notes_enc: undefined,
  }));

  const treatmentNotes = (
    db.prepare("SELECT * FROM treatment_notes ORDER BY id").all() as Array<
      Record<string, unknown>
    >
  ).map((row) => ({
    ...row,
    body: decrypt(row.body_enc as string),
    body_enc: undefined,
  }));

  const payments = db.prepare("SELECT * FROM payments ORDER BY id").all();

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    clients,
    appointments,
    treatmentNotes,
    payments,
  };
}

/**
 * Encrypts a bundle under a passphrase. The salt and parameters travel with
 * the file, so a future version can change them without orphaning old backups.
 */
export function encryptBackup(bundle: BackupBundle, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32, SCRYPT_PARAMS);
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(bundle), "utf8"),
    cipher.final(),
  ]);

  const envelope = {
    format: "practice-backup",
    version: BACKUP_VERSION,
    kdf: "scrypt",
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope, null, 2), "utf8");
}

export function decryptBackup(file: Buffer, passphrase: string): BackupBundle {
  const envelope = JSON.parse(file.toString("utf8"));
  if (envelope.format !== "practice-backup") {
    throw new Error("That doesn't look like a backup file.");
  }

  const key = scryptSync(passphrase, Buffer.from(envelope.salt, "base64"), 32, {
    N: envelope.N,
    r: envelope.r,
    p: envelope.p,
    maxmem: 128 * envelope.N * envelope.r * 2,
  });

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

  try {
    const json = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json);
  } catch {
    // GCM authentication failing here almost always means a wrong passphrase.
    throw new Error("Couldn't decrypt that — check the passphrase is right.");
  }
}

/** A quick count of what a backup would contain, for the settings page. */
export function backupSummary() {
  const db = getDb();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  return {
    clients: count("clients"),
    appointments: count("appointments"),
    notes: count("treatment_notes"),
    payments: count("payments"),
  };
}
