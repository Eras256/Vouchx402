import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { getQuote, pay, fetchScore, verifyAttestation, getRiskScore } from "../src/index.js";
// Test-only reuse of the main repo's own server + funded testnet wallet
// (never shipped in the published package, see package.json "files").
// The live vouch402.fly.dev deployment is mainnet-only post-cutover, so
// testing "against Base Sepolia with a real testnet payment" (the gate)
// means running the real server code locally against the local .env's
// NETWORK=base-sepolia, exactly like test/server.test.ts already does,
// not hitting the live instance.
import { createApp } from "../../src/server/app.js";
import { loadDeployerAccount } from "../../src/lib/keystore.js";
import { env } from "../../src/lib/env.js";

describe("vouch402-sdk (Base Sepolia, real payments)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    if (env.network !== "base-sepolia") {
      throw new Error(`Refusing to run: NETWORK=${env.network}, expected base-sepolia for this test.`);
    }
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("getQuote parses a real 402 payment-requirements body", async () => {
    const quote = await getQuote(env.payTo, { baseUrl });
    expect(quote.scheme).toBe("exact-direct");
    expect(quote.network).toBe("base-sepolia");
    expect(quote.payTo.toLowerCase()).toBe(env.payTo.toLowerCase());
    expect(quote.extra.resourceId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("runs the full quote -> pay -> fetch -> verify flow with a real testnet payment", async () => {
    const { account } = loadDeployerAccount();
    const address = env.payTo;

    const result = await getRiskScore(address, account, { baseUrl });

    expect(result.address.toLowerCase()).toBe(address.toLowerCase());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.attestationUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);

    // The point of verifyAttestation: not just trusting the API's own
    // claim. Confirm it actually resolves on Base Sepolia EAS, attested
    // by the same wallet the server signs with.
    expect(result.attestation).toBeDefined();
    expect(result.attestation!.uid).toBe(result.attestationUid);
    expect(result.attestation!.attester.toLowerCase()).toBe(env.payTo.toLowerCase());
    expect(result.attestation!.revoked).toBe(false);

    console.log(
      `[sdk test] real testnet payment tx=${result.txHash} score=${result.score} attestationUid=${result.attestationUid}`
    );
  }, 60_000);

  it("fetchScore rejects replaying an already-consumed payment proof", async () => {
    const { account } = loadDeployerAccount();
    const address = env.payTo;

    const quote = await getQuote(address, { baseUrl });
    const txHash = await pay(quote, account);
    const first = await fetchScore(address, quote, txHash, account.address, { baseUrl });
    expect(first.score).toBeGreaterThanOrEqual(0);

    await expect(fetchScore(address, quote, txHash, account.address, { baseUrl, maxAttempts: 1 })).rejects.toThrow();
  }, 60_000);

  it("verifyAttestation resolves independently without needing a signer", async () => {
    const { account } = loadDeployerAccount();
    const address = env.payTo;
    const result = await getRiskScore(address, account, { baseUrl, skipVerification: true });

    // No key/signer involved here at all, a pure read against EAS.
    const attestation = await verifyAttestation(result.attestationUid, "base-sepolia");
    expect(attestation.attester.toLowerCase()).toBe(env.payTo.toLowerCase());
  }, 60_000);
});
