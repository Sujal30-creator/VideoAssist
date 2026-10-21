import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Allow video file uploads up to 120 MB via Server Actions
      bodySizeLimit: "120mb",
    },
    // Fix: Allow Next.js proxy/middleware to pass payloads larger than 10MB
    proxyClientMaxBodySize: "120mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
