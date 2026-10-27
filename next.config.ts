import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Release builds in dist/ (gitignored, e.g. boundary PMTiles) are read only in local
  // development through REGION_LAYERS_PMTILES_DIR; keep them out of server bundles.
  outputFileTracingExcludes: { "*": ["./dist/**/*"] },
};

export default nextConfig;
