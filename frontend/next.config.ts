import type { NextConfig } from "next";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const versionFile = resolve(__dirname, "../VERSION");
const version = existsSync(versionFile)
  ? readFileSync(versionFile, "utf-8").trim()
  : require("./package.json").version;

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
