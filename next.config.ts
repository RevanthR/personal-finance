import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The service worker must never be served stale, or a deploy's new
        // worker (and the cache-busting it does on activate) is picked up a
        // day late. updateViaCache:"none" on the client side covers most
        // browsers; this covers the rest and any intermediary cache.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
