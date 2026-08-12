import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // This repo has two npm projects (the API at the root, this app in
  // /web) — each with its own lockfile. Without this, Next.js guesses
  // the wrong workspace root from the outer lockfile.
  turbopack: {
    root: __dirname,
  },
};

export default withNextIntl(nextConfig);
