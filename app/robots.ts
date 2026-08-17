import type { MetadataRoute } from "next";

/**
 * Keeps search engines out until the site is genuinely ready.
 *
 * Blocking by default is the safe way round. The content is Elizabeth's own now,
 * but two things in `content/site.ts` are still marked ‹‹ CHECK ›› — the site's
 * real web address and her email address. An indexed page telling people to
 * email hello@example.com is worse than not being listed at all, and getting
 * something removed from Google is far more work than not putting it there.
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
