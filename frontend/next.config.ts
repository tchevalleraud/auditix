import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

const version = readFileSync(resolve(__dirname, "../VERSION"), "utf-8").trim();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  env: {
    APP_VERSION: version,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://nginx:80/api/:path*",
      },
    ];
  },
};

export default nextConfig;
