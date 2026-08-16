import type { Metadata } from "next";
import { site } from "@/content/site";
import "./globals.css";

/**
 * The root layout holds only the html/body shell. The public site's header and
 * footer live in `(site)/layout.tsx` instead, so the admin dashboard doesn't
 * end up wrapped in the shop-window chrome — a client record is no place for a
 * "Book a treatment" button.
 */

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    type: "website",
    locale: "en_GB",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
