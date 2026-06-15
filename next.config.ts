import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // forbidden() (used by AuthGuard for real 403s) requires this experimental
    // flag; pairs with app/forbidden.tsx.
    authInterrupts: true,
  },
};

export default nextConfig;
