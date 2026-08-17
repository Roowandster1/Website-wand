import type { MetadataRoute } from "next";

/**
 * Keeps search engines out until the site is genuinely ready.
 *
 * Blocking by default is the safe way round. Until the placeholder business
 * name, therapist and testimonials are replaced with real ones, an indexed copy
 * of this site is a fake business in Google's results — and removing it later is
 * far more work than not being listed in the first place.
 *
 * When the content is real, set NEXT_PUBLIC_ALLOW_INDEXING=1 and redeploy.
 * `/admin` stays blocked either way.
 */
export default function robots(): MetadataRoute.Robots {
  const ready = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";

  return {
    rules: ready
      ? { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }
      : { userAgent: "*", disallow: "/" },
  };
}
