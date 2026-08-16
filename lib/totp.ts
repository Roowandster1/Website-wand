import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import "server-only";

/**
 * TOTP (RFC 6238) — the six-digit codes from Google Authenticator, Authy,
 * 1Password or the iPhone's built-in password manager.
 *
 * Written out rather than pulled from a package: it is short, it has no moving
 * parts, and a dependency that generates authentication codes is a dependency
 * worth not having.
 */

const DIGITS = 6;
const PERIOD = 30; // seconds
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid character in TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh, random secret to show as a QR code when she turns 2FA on. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function generateCode(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/**
 * Checks a code, allowing one step either side so a phone clock that is a few
 * seconds out doesn't lock her out of her own records.
 */
export function verifyCode(secret: string, token: string, window = 1): boolean {
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let drift = -window; drift <= window; drift++) {
    const expected = generateCode(secret, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** The otpauth:// URL that becomes the QR code in her authenticator app. */
export function buildOtpAuthUrl(secret: string, account: string, issuer: string) {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    account,
  )}?${params.toString()}`;
}

/** One-time codes for the day the phone is lost, broken or upgraded. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"),
  );
}

/**
 * Recovery codes are stored hashed, never in the clear — otherwise anyone who
 * reads the database gets a permanent way past the second factor.
 *
 * A plain SHA-256 is the right tool here rather than scrypt: these codes are 40
 * bits of randomness that nobody chose and nobody has to remember, so there is
 * no dictionary to attack and no need for a deliberately slow hash.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/\s/g, ""))
    .digest("hex");
}
