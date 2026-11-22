import type { NextConfig } from "next";

/**
 * The landing site (ADR-0044, doc 23): a static export served by Cloudflare Pages.
 * No server, no analytics; fonts are self-hosted by next/font.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ["@thoth/ui"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
