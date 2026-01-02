import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {},
  outputFileTracingRoot: rootDir,
};

export default nextConfig;
