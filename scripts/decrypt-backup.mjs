#!/usr/bin/env node
/**
 * Reads a practice backup file without needing the website, the server, the
 * database, or anything installed beyond Node.js itself.
 *
 * This exists because a backup you can only open with the app that made it is
 * not really a backup. Keep a copy of this file wherever the backups live.
 *
 *   node scripts/decrypt-backup.mjs practice-backup-2026-08-16.json
 *   node scripts/decrypt-backup.mjs backup.json --out recovered.json
 */

import { createDecipheriv, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outIndex = args.indexOf("--out");
const outFile = outIndex !== -1 ? args[outIndex + 1] : null;

if (!file) {
  console.error("Usage: node decrypt-backup.mjs <backup-file> [--out result.json]");
  process.exit(1);
}

/** Reads a passphrase without echoing it to the terminal. */
function askPassphrase() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdout = process.stdout;
    const wasRaw = process.stdin.isTTY;

    if (wasRaw) {
      // Suppress echo so the passphrase doesn't end up in scrollback.
      const write = stdout.write.bind(stdout);
      stdout.write = (chunk, ...rest) =>
        typeof chunk === "string" && chunk.includes("\n") === false
          ? true
          : write(chunk, ...rest);
      rl.question("Backup passphrase: ", (answer) => {
        stdout.write = write;
        stdout.write("\n");
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question("Backup passphrase: ", (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

const envelope = JSON.parse(readFileSync(file, "utf8"));

if (envelope.format !== "practice-backup") {
  console.error("That file isn't a practice backup.");
  process.exit(1);
}

const passphrase = await askPassphrase();

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

let plaintext;
try {
  plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
} catch {
  console.error("\nCouldn't decrypt that. The passphrase is almost certainly wrong.");
  process.exit(1);
}

const bundle = JSON.parse(plaintext);

if (outFile) {
  writeFileSync(outFile, JSON.stringify(bundle, null, 2));
  console.log(`\nWritten to ${outFile}`);
} else {
  console.log(JSON.stringify(bundle, null, 2));
}

console.error(
  `\nBacked up ${bundle.exportedAt}: ` +
    `${bundle.clients.length} clients, ` +
    `${bundle.appointments.length} appointments, ` +
    `${bundle.treatmentNotes.length} notes, ` +
    `${bundle.payments.length} payments.`,
);
