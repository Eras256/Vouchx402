import { createWalletClient, createPublicClient, http, encodeFunctionData, type Account } from "viem";
import { base, baseSepolia } from "viem/chains";
import { createRequire } from "node:module";
import { JsonRpcProvider } from "ethers";
import { DEFAULT_API_BASE_URL, EAS_ADDRESS, erc20TransferAbi, rpcUrlFor } from "./constants.js";
import type { FulfillmentAttestation, Network, PaymentProof, RiskScoreResult, X402Requirement } from "./types.js";

// eas-sdk's package.json "exports" routes ESM importers to its lib.esm
// build, whose `import { isEqual } from "lodash"` doesn't survive Node's
// strict ESM loader (lodash's CJS export shape isn't statically
// analyzable). Forcing require() here resolves the "default" condition
// instead, the same CJS build the main Vouch402 repo already depends on
// successfully. Confirmed by hitting the real failure first, not assumed.
const require = createRequire(import.meta.url);
const { EAS, ZERO_ADDRESS } = require("@ethereum-attestation-service/eas-sdk") as typeof import("@ethereum-attestation-service/eas-sdk");

export interface GetQuoteOptions {
  /** Defaults to the live Vouch402 instance. Override for a local/staging server. */
  baseUrl?: string;
}

/** GET the resource with no payment proof, parse the 402 body's
 * `accepts[0]`. Vouch402 never releases the resource for free, so a
 * non-402 response here is always an error, not a degraded success. */
export async function getQuote(address: string, options: GetQuoteOptions = {}): Promise<X402Requirement> {
  const baseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  const res = await fetch(`${baseUrl}/v1/risk-score/${address}`);
  if (res.status !== 402) {
    throw new Error(`Expected a 402 payment-required quote, got ${res.status}`);
  }
  const body = (await res.json()) as { x402Version: 1; accepts: X402Requirement[] };
  const requirement = body.accepts[0];
  if (!requirement) throw new Error("402 response had no payment requirements");
  return requirement;
}

function chainFor(network: Network) {
  return network === "base" ? base : baseSepolia;
}

/** Pays a quote with a real on-chain USDC transfer. Which network to pay
 * on comes from the quote's own `network` field, not an assumption or a
 * separate parameter the caller could get out of sync with the quote. */
export async function pay(quote: X402Requirement, signer: Account): Promise<`0x${string}`> {
  const chain = chainFor(quote.network);
  const walletClient = createWalletClient({ account: signer, chain, transport: http(rpcUrlFor(quote.network)) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrlFor(quote.network)) });

  const txHash = await walletClient.sendTransaction({
    to: quote.asset as `0x${string}`,
    data: encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: "transfer",
      args: [quote.payTo as `0x${string}`, BigInt(quote.maxAmountRequired)],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export interface FetchScoreOptions extends GetQuoteOptions {
  /** How many times to retry on a 402 specifically (the server's own
   * "not confirmed yet, retry shortly" signal for a freshly-settled
   * payment that a public RPC hasn't caught up to internally), before
   * giving up. Same class of lag documented throughout the main
   * Vouch402 repo's DECISION_LOG. */
  maxAttempts?: number;
  retryDelayMs?: number;
}

/** Retries the resource request with proof of payment attached, until it
 * succeeds or a non-402 failure ends the attempt early. */
export async function fetchScore(
  address: string,
  quote: X402Requirement,
  txHash: string,
  payer: string,
  options: FetchScoreOptions = {}
): Promise<RiskScoreResult> {
  const baseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  const maxAttempts = options.maxAttempts ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 2000;

  const proof: PaymentProof = { resourceId: quote.extra.resourceId, txHash, payer };
  const header = Buffer.from(JSON.stringify(proof)).toString("base64");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${baseUrl}/v1/risk-score/${address}`, { headers: { "X-PAYMENT": header } });
    if (res.ok) return (await res.json()) as RiskScoreResult;

    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
    if (res.status === 402 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  throw new Error("Exhausted retries confirming payment");
}

export interface VerifyAttestationOptions {
  rpcUrl?: string;
  retries?: number;
  retryDelayMs?: number;
}

/** Independently resolves the fulfillment attestation via EAS directly
 * (a read-only provider, no signer/key needed), rather than trusting the
 * API's own claim of what it attested. Retries on the same public-RPC
 * read-after-write lag documented in the main repo: a read immediately
 * after the write can land on a backend node that hasn't caught up. */
export async function verifyAttestation(
  attestationUid: string,
  network: Network,
  options: VerifyAttestationOptions = {}
): Promise<FulfillmentAttestation> {
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const provider = new JsonRpcProvider(options.rpcUrl ?? rpcUrlFor(network));
  const eas = new EAS(EAS_ADDRESS).connect(provider);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const attestation = await eas.getAttestation(attestationUid);
      if (attestation.attester !== ZERO_ADDRESS || attempt >= retries) {
        return {
          uid: attestationUid,
          attester: attestation.attester,
          recipient: attestation.recipient,
          revoked: attestation.revocationTime !== 0n,
          schema: attestation.schema,
          time: attestation.time,
        };
      }
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw new Error("unreachable");
}

export interface GetRiskScoreOptions extends FetchScoreOptions, VerifyAttestationOptions {
  /** Skip the independent EAS resolution step. Defaults to false: the
   * whole point of this SDK over a raw fetch is not stopping at "the API
   * said so." */
  skipVerification?: boolean;
}

export interface GetRiskScoreResult extends RiskScoreResult {
  txHash: `0x${string}`;
  network: Network;
  attestation?: FulfillmentAttestation;
}

/** The full quote -> pay -> fetch -> verify flow in one call, matching
 * what scripts/demo.ts in the main repo already does by hand. */
export async function getRiskScore(
  address: string,
  signer: Account,
  options: GetRiskScoreOptions = {}
): Promise<GetRiskScoreResult> {
  const quote = await getQuote(address, options);
  const txHash = await pay(quote, signer);
  const result = await fetchScore(address, quote, txHash, signer.address, options);
  const attestation = options.skipVerification
    ? undefined
    : await verifyAttestation(result.attestationUid, quote.network, options);
  return { ...result, txHash, network: quote.network, attestation };
}
