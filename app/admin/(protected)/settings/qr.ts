"use server";

import QRCode from "qrcode";
import { site } from "@/content/site";
import { requireUser } from "@/app/admin/actions";
import { buildOtpAuthUrl } from "@/lib/totp";

/**
 * Renders the otpauth:// URL as a QR code data URI.
 *
 * Done on the server so the QR library never ships to the browser, and so the
 * secret is turned into an image in one place rather than being assembled by
 * client-side code.
 */
export async function qrDataUrl(secret: string, email: string): Promise<string> {
  await requireUser();

  const url = buildOtpAuthUrl(secret, email, site.name);
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 1,
    color: { dark: "#3a322b", light: "#ffffff" },
  });
}
