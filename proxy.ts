import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap first gate only. (Next 16 calls this file "proxy"; it was
 * "middleware" in earlier versions.)
 *
 * This layer cannot reach SQLite, so it can see whether a session cookie is
 * present but not whether it is valid. The real check — does this session
 * exist, has it expired, which user is it — happens in the protected admin
 * layout, which every page holding client data renders inside. Never treat
 * reaching a page as proof of authentication; the layout is the authority.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicAuthRoute =
    pathname.startsWith("/admin/login") || pathname.startsWith("/admin/setup");

  if (!isPublicAuthRoute && !request.cookies.has("practice_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
