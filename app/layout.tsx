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
  /**
   * The card that appears when the address is pasted into WhatsApp, Facebook,
   * iMessage or Slack. This matters more for a counselling practice than for
   * most sites, because the link is usually shared person to person by somebody
   * making a recommendation — and a bare grey rectangle undersells that.
   *
   * public/og.jpg is a static file, rebuilt with `node scripts/make-og-image.mjs`
   * after a change of photograph.
   */
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    type: "website",
    locale: "en_GB",
    siteName: site.name,
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: `${site.name}, ${site.role}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: ["/og.jpg"],
  },
  /* No `alternates.canonical` here on purpose: set in the root layout it would
     apply to every page, so each one would declare the home page as its
     canonical URL and ask search engines to drop it. If canonicals are wanted
     they have to be per-page. */
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
