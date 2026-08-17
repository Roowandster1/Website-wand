import type { MetadataRoute } from "next";
import { site } from "@/content/site";

/**
 * The sitemap, served at /sitemap.xml.
 *
 * Small enough to list by hand, and worth listing: without one a search engine
 * has to discover the pages by following links and guess at their relative
 * importance. Five pages is not a crawling challenge, but saying plainly that
 * the home page matters most and the privacy notice matters least costs nothing.
 *
 * `robots.ts` still blocks everything until NEXT_PUBLIC_ALLOW_INDEXING=1, so
 * this has no effect at all before the site is genuinely ready.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/how-i-work", priority: 0.8 },
    { path: "/about", priority: 0.8 },
    { path: "/contact", priority: 0.9 },
    { path: "/privacy", priority: 0.2 },
  ];

  return pages.map(({ path, priority }) => ({
    // trailingSlash is on, so the canonical form of every page ends in "/".
    url: new URL(path === "/" ? "/" : `${path}/`, site.url).toString(),
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));
}
