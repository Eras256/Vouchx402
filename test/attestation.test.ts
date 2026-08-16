import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createWalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/server/app";
import { loadDeployerAccount } from "../src/lib/keystore";
import { erc20Abi, publicClientFor, httpTransport } from "../src/lib/chain";
import { env, easSchemaUidFulfillment } from "../src/lib/env";
import { getEas, getAttestationWithRetry } from "../src/lib/eas";
import { registerSchemas, FULFILLMENT_SCHEMA, DISPUTE_SCHEMA } from "../src/attestation/schemas";
import { disputeMessage, DisputeReasonCode } from "../src/attestation/dispute";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import type { X402PaymentRequiredBody } from "../src/server/x402";

/**
 * Phase 2 gate (docs/TECHNICAL_SPEC.md "Testing" + x402-SAP): full
 * pay-and-fulfill cycle produces a real, independently-resolvable
 * X402ServiceFulfillment attestation on Base Sepolia EAS; filing a
 * dispute against it produces an X402ServiceDispute whose refUID
 * resolves back to the original.
 */
describe("x402-SAP attestations (Base Sepolia)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Idempotent: reuses the already-registered UIDs from .env if present.
    await registerSchemas("base-sepolia");

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

  it("emits a resolvable fulfillment attestation, then a linked dispute", async () => {
    const { account } = loadDeployerAccount();
    const targetAddress = env.payTo;

    // --- Pay-and-fulfill cycle (Phase 1 flow) ---
    const quoteRes = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(quoteRes.status).toBe(402);
    const quote = (await quoteRes.json()) as X402PaymentRequiredBody;
    const requirement = quote.accepts[0];

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: httpTransport(env.baseSepoliaRpcUrl),
    });
    const txHash = await walletClient.writeContract({
      address: requirement.asset as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [requirement.payTo as `0x${string}`, BigInt(requirement.maxAmountRequired)],
    });
    await publicClientFor("base-sepolia").waitForTransactionReceipt({ hash: txHash });

    const proof = {
      resourceId: requirement.extra.resourceId,
      txHash,
      payer: account.address,
      jurisdictionAttestation: true,
    };
    const xPayment = Buffer.from(JSON.stringify(proof)).toString("base64");

    const fulfillRes = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });
    expect(fulfillRes.status).toBe(200);
    const fulfillBody = await fulfillRes.json();

    expect(fulfillBody.attestationUid).toBeTruthy();
    console.log(`[Phase 2] Fulfillment attestation UID: ${fulfillBody.attestationUid}`);

    // --- Independently resolve the fulfillment attestation via EAS ---
    const eas = getEas("base-sepolia");
    const fulfillmentAttestation = await getAttestationWithRetry(eas, fulfillBody.attestationUid);
    expect(fulfillmentAttestation.schema.toLowerCase()).toBe(easSchemaUidFulfillment("base-sepolia").toLowerCase());

    const decodedFulfillment = new SchemaEncoder(FULFILLMENT_SCHEMA).decodeData(fulfillmentAttestation.data);
    const decodedPayer = decodedFulfillment.find((i) => i.name === "payer")?.value.value as string;
    const decodedResponseHash = decodedFulfillment.find((i) => i.name === "responseHash")?.value.value as string;
    expect(decodedPayer.toLowerCase()).toBe(account.address.toLowerCase());

    // responseHash must match keccak256 of exactly what the client received
    // (attestationUid excluded, per src/attestation/middleware.ts).
    const { hashResponsePayload } = await import("../src/attestation/middleware");
    const expectedHash = hashResponsePayload({
      address: fulfillBody.address,
      score: fulfillBody.score,
      signals: fulfillBody.signals,
    });
    expect(decodedResponseHash.toLowerCase()).toBe(expectedHash.toLowerCase());

    console.log(`[Phase 2] Gate met: fulfillment attestation independently resolved and verified via EAS.`);

    // --- File a dispute against it, signed by the original payer ---
    const reasonCode = DisputeReasonCode.StaleData;
    const details = "v0 flag list is intentionally empty: score is not a complete risk model.";
    const message = disputeMessage(fulfillBody.attestationUid, reasonCode, details);
    const signature = await account.signMessage({ message });

    const disputeRes = await fetch(`${baseUrl}/v1/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refUID: fulfillBody.attestationUid, reasonCode, details, signature }),
    });
    const disputeBody = await disputeRes.json();
    if (disputeRes.status !== 200) console.error("[Phase 2] Dispute failed:", disputeRes.status, disputeBody);
    expect(disputeRes.status).toBe(200);
    expect(disputeBody.disputeUid).toBeTruthy();
    expect(disputeBody.disputant.toLowerCase()).toBe(account.address.toLowerCase());

    console.log(`[Phase 2] Dispute attestation UID: ${disputeBody.disputeUid}`);

    // --- Confirm the dispute's refUID resolves back to the fulfillment ---
    const disputeAttestation = await getAttestationWithRetry(eas, disputeBody.disputeUid);
    expect(disputeAttestation.refUID.toLowerCase()).toBe(fulfillBody.attestationUid.toLowerCase());

    const decodedDispute = new SchemaEncoder(DISPUTE_SCHEMA).decodeData(disputeAttestation.data);
    const decodedRefUidField = decodedDispute.find((i) => i.name === "refUID")?.value.value as string;
    expect(decodedRefUidField.toLowerCase()).toBe(fulfillBody.attestationUid.toLowerCase());

    console.log(`[Phase 2] Gate met: dispute refUID resolves back to the original fulfillment attestation.`);
  }, 90_000);

  it("rejects a dispute whose signature doesn't match the fulfillment's payer", async () => {
    // Reuse whatever fulfillment attestation UID we can find isn't required:
    // an unrelated signer's signature must fail regardless of refUID
    // validity, since submitDispute checks the payer match before anything
    // schema-specific.
    const impostor = privateKeyToAccount(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
    const reasonCode = DisputeReasonCode.Other;
    const details = "not actually the payer";
    // Use a syntactically valid-looking but non-existent refUID; the
    // signature/payer mismatch (or unknown-attestation check) must reject
    // before anything else matters.
    const refUID = "0x" + "11".repeat(32);
    const message = disputeMessage(refUID, reasonCode, details);
    const signature = await impostor.signMessage({ message });

    const res = await fetch(`${baseUrl}/v1/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refUID, reasonCode, details, signature }),
    });
    expect(res.status).toBe(400);
  }, 15_000); // exhausting getAttestationWithRetry's backoff on a genuinely unknown UID takes a few seconds
});
