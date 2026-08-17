import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public marketing pages are still prerendered to static HTML at build
  // time — but this is not a static export, because the admin dashboard needs a
  // running server for sessions, the database and encryption.
  //
  // `standalone` traces only the files the server actually needs, turning a
  // 460MB node_modules into something a container can copy without running out
  // of memory. It is opt-in via the environment so that `npm run dev` and
  // `npm start` keep working normally on a laptop — `next start` does not run a
  // standalone build, `node server.js` does. The Dockerfile sets this.
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),

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
