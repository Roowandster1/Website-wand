import { addDays, nowSql, todaySql } from "./dates";
import { getDb } from "./db";
import "server-only";

/**
 * Website analytics, first-party and cookieless.
 *
 * Deliberately not Google Analytics. This is a health-related site, and a
 * third-party tracker there means a consent banner, visitor data leaving the
 * country, and a lawful-basis question nobody wants to answer. Instead this
 * counts page views in her own database.
 *
 * What is stored: the path, whether the visit came from another site, the
 * date, and whether the screen was small. What is NOT stored: IP addresses,
 * cookies, fingerprints, or anything that could identify a person or link two
 * visits together. That is what keeps it outside the consent rules — and it is
 * still enough to answer "is anyone reading the treatments page?".
 *
 * The trade-off is honest: without identifiers there is no true "unique
 * visitors" figure. Views are views.
 */

/** Referrers reduced to a bare hostname; anything internal becomes "direct". */
function normaliseReferrer(referrer: string | null, host: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (host && url.hostname === host) return null; // internal navigation
    return url.hostname.replace(/^www\./, "").slice(0, 100);
  } catch {
    return null;
  }
}

/** Obvious crawlers, so the numbers reflect people rather than robots. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitor|preview|scan|curl|wget|python-requests/i;

export function recordPageView(options: {
  path: string;
  referrer: string | null;
  userAgent: string | null;
  host: string | null;
}): boolean {
  const ua = options.userAgent ?? "";
  if (!ua || BOT_PATTERN.test(ua)) return false;

  // Only track the public pages. The admin is nobody's business but hers, and
  // its paths can contain client record ids.
  const path = options.path.split("?")[0].slice(0, 200);
  if (path.startsWith("/admin")) return false;

  getDb()
    .prepare(
      `INSERT INTO page_views (path, referrer, viewed_at, viewed_date, is_mobile)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      path,
      normaliseReferrer(options.referrer, options.host),
      nowSql(),
      todaySql(),
      /Mobi|Android|iPhone/i.test(ua) ? 1 : 0,
    );

  return true;
}

export type ViewsByPath = { path: string; views: number };
export type ViewsByDay = { day: string; views: number };
export type ViewsByReferrer = { referrer: string; views: number };

export type SiteStats = {
  totalViews: number;
  mobileShare: number;
  byPath: ViewsByPath[];
  byDay: ViewsByDay[];
  byReferrer: ViewsByReferrer[];
  contactRate: number;
};

export function siteStats(days = 30): SiteStats {
  const db = getDb();
  const since = addDays(todaySql(), -days);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(is_mobile), 0) AS mobile
       FROM page_views WHERE viewed_date >= ?`,
    )
    .get(since) as { n: number; mobile: number };

  const byPath = db
    .prepare(
      `SELECT path, COUNT(*) AS views FROM page_views
       WHERE viewed_date >= ? GROUP BY path ORDER BY views DESC LIMIT 12`,
    )
    .all(since) as ViewsByPath[];

  const byDay = db
    .prepare(
      `SELECT viewed_date AS day, COUNT(*) AS views FROM page_views
       WHERE viewed_date >= ? GROUP BY day ORDER BY day`,
    )
    .all(since) as ViewsByDay[];

  const byReferrer = db
    .prepare(
      `SELECT COALESCE(referrer, 'Direct or bookmarked') AS referrer,
              COUNT(*) AS views
       FROM page_views WHERE viewed_date >= ?
       GROUP BY referrer ORDER BY views DESC LIMIT 8`,
    )
    .all(since) as ViewsByReferrer[];

  // The number that actually matters: of everyone who looked at the site, how
  // many got as far as the contact page.
  const home = byPath.find((p) => p.path === "/" || p.path === "")?.views ?? 0;
  const contact =
    byPath.find((p) => p.path.startsWith("/contact"))?.views ?? 0;

  return {
    totalViews: total.n,
    mobileShare: total.n ? total.mobile / total.n : 0,
    byPath,
    byDay,
    byReferrer,
    contactRate: home ? contact / home : 0,
  };
}
