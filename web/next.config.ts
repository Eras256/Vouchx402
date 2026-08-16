import type { NextConfig } from "next";

// No next-intl plugin/middleware here: locale is a client-side
// preference now (see src/components/locale-provider.tsx), not a
// per-request URL segment, so the server-side request-config machinery
// next-intl/plugin exists for isn't needed anymore.
const nextConfig: NextConfig = {
  // This repo has two npm projects (the API at the root, this app in
  // /web), each with its own lockfile. Without this, Next.js guesses
  // the wrong workspace root from the outer lockfile.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
