import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public marketing pages are still prerendered to static HTML at build
  // time — but the app no longer uses `output: "export"`, because the admin
  // dashboard needs a running server for sessions, the database and encryption.
  // See "Putting it online" in README.md.
  trailingSlash: true,

  // better-sqlite3 is a native module and must not be bundled.
  serverExternalPackages: ["better-sqlite3"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Client records must never be cached by a browser or a proxy.
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
