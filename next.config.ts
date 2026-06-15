import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build output (.next/standalone + a minimal server.js) so the
  // production Docker image ships only traced runtime deps. The runner serves
  // with `node server.js` instead of `next start`.
  output: "standalone",
};

export default nextConfig;
