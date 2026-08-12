import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { createApp } from "../src/server/app";
import { loadDeployerAccount } from "../src/lib/keystore";
import { erc20Abi } from "../src/lib/chain";
import { env, explorerBaseFor } from "../src/lib/env";
import type { X402PaymentRequiredBody } from "../src/server/x402";

/**
 * Full x402 flow against Base Sepolia, per docs/TECHNICAL_SPEC.md "Testing":
 * unpaid request -> 402 -> real testnet USDC payment -> retried request ->
 * 200 with score + attestation UID field (attestation itself lands in
 * Phase 2). No mocked payment verification: this sends a real Base Sepolia
 * transaction and verifies the server accepts it server-side.
 *
 * Requires the deployer wallet (DEPLOYER_KEYSTORE_ACCOUNT) to hold Base
 * Sepolia ETH (gas) and USDC (>= PRICE_USDC). See README "Funding the
 * testnet wallet".
 */
describe("GET /v1/risk-score/:address (Base Sepolia)", () => {
  let server: Server;
  let baseUrl: string;
  let lastProof: { resourceId: string; txHash: string; payer: string } | undefined;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 402 with x402 payment requirements when unpaid", async () => {
    const targetAddress = env.payTo; // scoring an arbitrary address; reuse deployer addr for convenience
    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(res.status).toBe(402);

    const body = (await res.json()) as X402PaymentRequiredBody;
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].network).toBe("base-sepolia");
    expect(body.accepts[0].payTo.toLowerCase()).toBe(env.payTo.toLowerCase());
  });

  it("pays with real testnet USDC and returns 200 with a real score", async () => {
    const { account } = loadDeployerAccount();
    const targetAddress = env.payTo;

    // 1. Unpaid request -> 402 quote.
    const quoteRes = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(quoteRes.status).toBe(402);
    const quote = (await quoteRes.json()) as X402PaymentRequiredBody;
    const requirement = quote.accepts[0];

    // 2. Agent pays: a real USDC transfer on Base Sepolia to payTo.
    //    v0 note (see DECISION_LOG.md): direct on-chain settlement, not
    //    the EIP-3009 facilitator-relay scheme. Payer == payTo here only
    //    because this test uses a single funded wallet to prove the
    //    mechanism; production usage involves two distinct parties.
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(env.baseSepoliaRpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: requirement.asset as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [requirement.payTo as `0x${string}`, BigInt(requirement.maxAmountRequired)],
    });

    console.log(`[Phase 1] Base Sepolia payment tx: ${explorerBaseFor("base-sepolia")}/tx/${txHash}`);

    // 3. Retry with proof.
    const proof = {
      resourceId: requirement.extra.resourceId,
      txHash,
      payer: account.address,
    };
    lastProof = proof;
    const xPayment = Buffer.from(JSON.stringify(proof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });

    const body = await res.json();
    if (res.status !== 200) {
      console.error("[Phase 1] Unexpected response:", res.status, body);
    }
    expect(res.status).toBe(200);
    expect(body.address.toLowerCase()).toBe(targetAddress.toLowerCase());
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.signals).toBeDefined();

    console.log(`[Phase 1] Gate met: 200 response for a real settled payment. tx=${txHash} score=${body.score}`);
  }, 60_000);

  it("rejects replaying the same payment proof", async () => {
    if (!lastProof) throw new Error("Previous test did not produce a settled payment to replay");
    const targetAddress = env.payTo;
    const xPayment = Buffer.from(JSON.stringify(lastProof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });

    // Quote already consumed and/or tx hash already processed — either
    // way, replay must be rejected, never a second 200.
    expect(res.status).toBe(402);
  });
});
