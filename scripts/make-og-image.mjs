#!/usr/bin/env node
/**
 * Builds public/og.jpg — the preview card that appears when the site's address
 * is pasted into WhatsApp, Facebook, iMessage or Slack.
 *
 * Without one, a shared link shows as a bare grey rectangle, which for a
 * counselling practice is a wasted first impression: the link is most often
 * shared person to person, by someone recommending her.
 *
 * Run it again after changing her photograph or her name:
 *
 *     node scripts/make-og-image.mjs
 *
 * It writes a static file, so nothing is generated at request time and the
 * server does no work for it.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Kept in step with content/site.ts by hand — this runs outside Next, so it
   cannot import a TypeScript module. */
const NAME = "Elizabeth Wand";
const ROLE = "BACP Accredited Counsellor";
const LINE = "Person-centred counselling for adults";
const PLACES = "London E4 & E17  ·  Online  ·  By phone";
const PORTRAIT = join(root, "public", "elizabeth.jpg");

/* Facebook, WhatsApp, iMessage and Slack all crop to about 1.91:1. */
const W = 1200;
const H = 630;

const CREAM = "#faf8f4";
const INK = "#23292a";
const SOFT = "#5b6763";
const SAGE = "#6f8a7f";
const GREEN = "#2f6b60";

const PHOTO = 300;
const PHOTO_X = 96;
const PHOTO_Y = Math.round((H - PHOTO) / 2);
const TEXT_X = PHOTO_X + PHOTO + 72;

/** Anything in the text could contain a character XML cares about. */
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const hasPortrait = existsSync(PORTRAIT);

/* Liberation Serif is metric-compatible with Times and close enough to the
   site's Palatino-ish stack for a card this size. DejaVu Sans covers the
   letterspaced small caps. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- A single green edge, the same gesture the site's section rules make. -->
  <rect x="0" y="0" width="10" height="${H}" fill="${GREEN}"/>

  <g font-family="Liberation Serif, DejaVu Serif, serif" fill="${INK}">
    <text x="${hasPortrait ? TEXT_X : PHOTO_X}" y="286" font-size="76">${esc(NAME)}</text>
  </g>

  <g font-family="DejaVu Sans, Liberation Sans, sans-serif">
    <text x="${hasPortrait ? TEXT_X : PHOTO_X}" y="196"
          font-size="23" font-weight="bold" letter-spacing="3.4"
          fill="${SAGE}">${esc(ROLE.toUpperCase())}</text>

    <line x1="${hasPortrait ? TEXT_X : PHOTO_X}" y1="330"
          x2="${hasPortrait ? TEXT_X + 200 : PHOTO_X + 200}" y2="330"
          stroke="${SAGE}" stroke-width="1.5"/>

    <text x="${hasPortrait ? TEXT_X : PHOTO_X}" y="384"
          font-size="30" fill="${SOFT}">${esc(LINE)}</text>

    <text x="${hasPortrait ? TEXT_X : PHOTO_X}" y="436"
          font-size="26" fill="${SOFT}">${esc(PLACES)}</text>
  </g>
</svg>`;

const layers = [{ input: Buffer.from(svg), top: 0, left: 0 }];

if (hasPortrait) {
  layers.push({
    input: await sharp(await readFile(PORTRAIT))
      .resize(PHOTO, PHOTO, { fit: "cover" })
      .toBuffer(),
    top: PHOTO_Y,
    left: PHOTO_X,
  });
} else {
  console.warn(`! ${PORTRAIT} not found — building the card without a photo.`);
}

const out = join(root, "public", "og.jpg");
const buffer = await sharp({
  create: {
    width: W,
    height: H,
    channels: 3,
    background: CREAM,
  },
})
  .composite(layers)
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();

await writeFile(out, buffer);

const { width, height } = await sharp(buffer).metadata();
console.log(`wrote public/og.jpg — ${width}x${height}, ${buffer.length} bytes`);
