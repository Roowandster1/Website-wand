import { NextResponse, type NextRequest } from "next/server";
import { recordPageView } from "@/lib/pageviews";

/**
 * The page-view beacon.
 *
 * Counting happens here rather than in the page render so the public pages
 * stay statically prerendered and fast — a server-side counter would force
 * every page to be dynamic, which would make the site slower for the sake of
 * a statistic.
 *
 * Same-origin only, so the endpoint can't be used to inflate someone's
 * numbers from elsewhere.
 */
export async function POST(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");

  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  let path = "/";
  let referrer: string | null = null;

  try {
    const body = (await request.json()) as { path?: string; referrer?: string };
    if (typeof body.path === "string" && body.path.startsWith("/")) {
      path = body.path;
    }
    if (typeof body.referrer === "string") referrer = body.referrer;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  recordPageView({
    path,
    referrer,
    userAgent: request.headers.get("user-agent"),
    host: host?.split(":")[0] ?? null,
  });

  // 204: the browser needs nothing back, and there is nothing to say.
  return new NextResponse(null, { status: 204 });
}
