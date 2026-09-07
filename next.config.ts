import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // /api/card/<mint>.png → /api/card/<mint>
      {
        source: "/api/card/:mint.png",
        destination: "/api/card/:mint",
      },
    ];
  },
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
