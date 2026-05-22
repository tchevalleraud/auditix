import type { NextConfig } from "next";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const versionFile = resolve(__dirname, "../VERSION");
const version = existsSync(versionFile)
  ? readFileSync(versionFile, "utf-8").trim()
  : require("./package.json").version;

const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://nginx:8080";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*"],
  env: {
    APP_VERSION: version,
    INTERNAL_API_URL: internalApiUrl,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${internalApiUrl}/api/v1/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
  // Legacy admin URLs were moved under the unified settings page. 308 keeps
  // the method and lets bookmarks / external links keep working.
  async redirects() {
    return [
      { source: "/admin", destination: "/settings/global", permanent: true },
      { source: "/admin/:path*", destination: "/settings/global/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
