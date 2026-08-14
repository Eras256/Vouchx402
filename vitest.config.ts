import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share a single funded Base Sepolia wallet and
    // submit real transactions from it; running test files in parallel
    // races nonce assignment across files (each fetches "next nonce"
    // independently) and causes spurious failures. Not needed once tests
    // don't all share one signer.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
