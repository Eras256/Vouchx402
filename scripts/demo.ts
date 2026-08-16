/**
 * End-to-end walkthrough: unpaid request -> 402 -> real on-chain USDC
 * payment -> paid retry -> 200 with score + attestation -> independent
 * EAS resolution -> a dispute filed against that attestation -> metrics.
 *
 * Runs unattended against whichever network is configured in .env
 * (NETWORK=base-sepolia|base), needs the deployer wallet funded with
 * gas + USDC on that network. See README "Funding the testnet wallet".
 */
import { createWalletClient } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createApp } from "../src/server/app";
import { loadDeployerAccount } from "../src/lib/keystore";
import { erc20Abi, publicClientFor, httpTransport } from "../src/lib/chain";
import { env, explorerBaseFor } from "../src/lib/env";
import { registerSchemas } from "../src/attestation/schemas";
import { getEas, getAttestationWithRetry } from "../src/lib/eas";
import { disputeMessage, DisputeReasonCode } from "../src/attestation/dispute";
import type { X402PaymentRequiredBody } from "../src/server/x402";

function step(n: number, label: string) {
  console.log(`\n[${n}] ${label}`);
}

async function main() {
  const network = env.network;
  console.log(`Vouch402 demo, network=${network}`);

  step(0, "Ensuring x402-SAP schemas are registered (idempotent)");
  await registerSchemas(network);

  const app = createApp();
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind demo server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const { account } = loadDeployerAccount();
    const target = env.payTo;
    console.log(`Server: ${baseUrl}  |  scoring address: ${target}`);

    step(1, "GET /v1/risk-score/:address (unpaid)");
    const quoteRes = await fetch(`${baseUrl}/v1/risk-score/${target}`);
    console.log(`   -> ${quoteRes.status}`);
    if (quoteRes.status !== 402) throw new Error("Expected 402");
    const quote = (await quoteRes.json()) as X402PaymentRequiredBody;
    const requirement = quote.accepts[0];
    console.log(`   payTo=${requirement.payTo} amount=${requirement.maxAmountRequired} asset=${requirement.asset}`);

    step(2, "Paying the quoted USDC amount on-chain");
    const walletClient = createWalletClient({
      account,
      chain: network === "base" ? base : baseSepolia,
      transport: httpTransport(network === "base" ? env.baseRpcUrl : env.baseSepoliaRpcUrl),
    });
    const txHash = await walletClient.writeContract({
      address: requirement.asset as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [requirement.payTo as `0x${string}`, BigInt(requirement.maxAmountRequired)],
    });
    console.log(`   tx: ${explorerBaseFor(network)}/tx/${txHash}`);
    await publicClientFor(network).waitForTransactionReceipt({ hash: txHash });
    console.log("   confirmed.");

    step(3, "GET /v1/risk-score/:address (paid retry)");
    // jurisdictionAttestation: true - required, see src/server/app.ts and
    // web/content/legal-*.md, "Restricted Jurisdictions". This demo runs
    // against the project's own funded dev wallet, not a real end user,
    // so attesting true here is accurate.
    const proof = {
      resourceId: requirement.extra.resourceId,
      txHash,
      payer: account.address,
      jurisdictionAttestation: true,
    };
    const xPayment = Buffer.from(JSON.stringify(proof)).toString("base64");
    const fulfillRes = await fetch(`${baseUrl}/v1/risk-score/${target}`, { headers: { "X-PAYMENT": xPayment } });
    const result = await fulfillRes.json();
    console.log(`   -> ${fulfillRes.status}`);
    if (fulfillRes.status !== 200) throw new Error(`Fulfillment failed: ${JSON.stringify(result)}`);
    console.log(`   score=${result.score} attestationUid=${result.attestationUid}`);

    step(4, "Independently resolving the fulfillment attestation via EAS");
    const eas = getEas(network);
    const attestation = await getAttestationWithRetry(eas, result.attestationUid);
    console.log(`   schema=${attestation.schema}`);
    console.log(`   attester=${attestation.attester} recipient=${attestation.recipient}`);

    step(5, "Filing a dispute against that attestation (shows the x402-SAP dispute path)");
    const reasonCode = DisputeReasonCode.Other;
    const details = "demo dispute, not a real complaint, just exercising the flow";
    const message = disputeMessage(result.attestationUid, reasonCode, details);
    const signature = await account.signMessage({ message });
    const disputeRes = await fetch(`${baseUrl}/v1/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refUID: result.attestationUid, reasonCode, details, signature }),
    });
    const disputeBody = await disputeRes.json();
    console.log(`   -> ${disputeRes.status}`);
    if (disputeRes.status !== 200) throw new Error(`Dispute failed: ${JSON.stringify(disputeBody)}`);
    console.log(`   disputeUid=${disputeBody.disputeUid}`);

    step(6, "GET /v1/metrics");
    const metrics = await (await fetch(`${baseUrl}/v1/metrics`)).json();
    console.log("  ", JSON.stringify(metrics));

    console.log("\nDone. Every step above is a real transaction/attestation on Base " + network + ".");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error("\nDemo failed:", err);
  process.exit(1);
});
