"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Records a page view on the public site.
 *
 * No cookies, no identifiers, no third-party script — it posts the path to the
 * site's own endpoint and nothing else. It also honours Do Not Track, which
 * costs a little accuracy and is the right thing to do on a health site.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;

    // React may run effects twice in development; this keeps one view per page.
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
    });

    // Trailing slash matters: the app sets `trailingSlash: true`, so posting to
    // "/api/collect" would 308-redirect on every single page view.
    // Failing to count a view must never break the page for a visitor.
    fetch("/api/collect/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
