import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import "server-only";

/**
 * Field-level encryption for special-category (health) data.
 *
 * Everything clinical is encrypted before it reaches SQLite, so the database
 * file on disk contains no readable health information. The key lives in the
 * environment, never in the database — losing the database does not lose
 * confidentiality, and losing the key does not lose the appointment diary.
 *
 * AES-256-GCM is authenticated: tampering with a stored value makes decryption
 * fail loudly rather than silently returning corrupted text.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, the size GCM is specified for
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "DATA_ENCRYPTION_KEY is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes, got ${key.length}. ` +
        "It should be 32 random bytes, base64 encoded.",
    );
  }

  cachedKey = key;
  return key;
}

/** Encrypts a string for storage. Empty input stays empty — nothing to hide. */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return null;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // iv.tag.ciphertext, each base64 — self-describing and easy to eyeball
  // in the database when confirming that nothing readable was stored.
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

/**
 * Reverses `encrypt`. Returns "" for empty fields rather than throwing, so a
 * client record with no allergies recorded renders normally.
 */
export function decrypt(stored: string | null | undefined): string {
  if (!stored) return "";

  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("Encrypted value is malformed (expected iv.tag.ciphertext)");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time comparison, for anything an attacker could guess repeatedly. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export { randomBytes };
