import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / partial prerendering are off: every page here reads the session cookie,
  // so there's little static shell to gain. Pages render dynamically per request.
  experimental: {
    // Receipt uploads (the browser shrinks photos first; the server caps files at 4 MB).
    serverActions: { bodySizeLimit: "5mb" },
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
