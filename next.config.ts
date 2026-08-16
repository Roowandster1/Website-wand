import type { NextConfig } from "next";

// Only needed if the site is served from a sub-folder rather than the root of a
// domain — which is what GitHub Pages does unless you attach a custom domain.
// See the "Putting it online" section of the README.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Emits a fully static site into `out/`, so it can be hosted anywhere —
  // GitHub Pages, Netlify, Cloudflare Pages — with no Node server to run.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
};

export default nextConfig;
