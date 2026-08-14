// Small, stable helpers mirroring src/lib/env.ts on the API side: this
// is a separate npm project (no shared workspace/build step between the
// two), so these are intentionally duplicated rather than imported.

export const API_BASE_URL = "https://vouch402.fly.dev";

export type ApiNetwork = "base" | "base-sepolia";

/** Maps the navbar's Testnet/Mainnet selector to the API's network name. */
export function toApiNetwork(uiNetwork: "testnet" | "mainnet"): ApiNetwork {
  return uiNetwork === "mainnet" ? "base" : "base-sepolia";
}

/** Verified live: both `base` and `base-sepolia` easscan.org subdomains
 * resolve to real attestations; see DECISION_LOG.md. */
export function easExplorerUrl(network: ApiNetwork, uid: string): string {
  return `https://${network}.easscan.org/attestation/view/${uid}`;
}

export function basescanTxUrl(network: ApiNetwork, txHash: string): string {
  return network === "base" ? `https://basescan.org/tx/${txHash}` : `https://sepolia.basescan.org/tx/${txHash}`;
}

// ---- Checkpoint 7c: Live stats + Recent activity ----
// Mirrors src/lib/db.ts's real shapes (getMetrics/getRecentActivity) and
// src/server/app.ts's actual response bodies: verified live against
// vouch402.fly.dev before wiring these up, not guessed.

export interface Metrics {
  uniquePayers: number;
  totalRequestsServed: number;
  totalVolumeUsdc: string;
  attestationCount: number;
  disputeCount: number;
}

export type FulfillmentStatusCode = 0 | 1 | 2;
export type DisputeReasonCode = 0 | 1 | 2 | 3;

export type ActivityItem =
  | {
      kind: "fulfillment";
      uid: string;
      status: FulfillmentStatusCode;
      payer: string;
      payee: string;
      network: ApiNetwork;
      createdAt: number;
      explorerUrl: string;
    }
  | {
      kind: "dispute";
      uid: string;
      refUid: string;
      disputant: string;
      reasonCode: DisputeReasonCode;
      network: ApiNetwork;
      createdAt: number;
      explorerUrl: string;
    };

export async function fetchMetrics(network: ApiNetwork, signal?: AbortSignal): Promise<Metrics> {
  const res = await fetch(`${API_BASE_URL}/v1/metrics?network=${network}`, { signal });
  if (!res.ok) throw new Error(`GET /v1/metrics failed: ${res.status}`);
  return res.json();
}

export async function fetchActivity(
  network: ApiNetwork,
  limit = 10,
  signal?: AbortSignal
): Promise<ActivityItem[]> {
  const res = await fetch(`${API_BASE_URL}/v1/activity?network=${network}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`GET /v1/activity failed: ${res.status}`);
  const data = (await res.json()) as { items: ActivityItem[] };
  return data.items;
}

// ---- Checkpoint 7d: interactive demo ----
// Mirrors src/server/x402.ts's real request/response shapes: verified
// against that file directly (not guessed): the "exact-direct" scheme
// (a real on-chain ERC-20 transfer + txHash proof, not EIP-3009/a
// facilitator), the atomic-string amount convention, and the exact
// { resourceId, txHash, payer } shape decodePaymentHeader() expects.

export interface X402Requirement {
  scheme: string;
  network: ApiNetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; resourceId: string };
}

export interface X402PaymentRequiredBody {
  x402Version: 1;
  accepts: X402Requirement[];
}

export interface RiskScoreResult {
  address: string;
  score: number;
  signals: {
    walletAgeDays: number;
    txCount: number;
    uniqueContractInteractions: number;
    flagged: boolean;
  };
  attestationUid: string;
}

/** USDC is always 6 decimals: a hand-rolled atomic-to-decimal-string
 * conversion avoids pulling in viem just for this one function on the
 * frontend, which otherwise has no need for it. */
export function formatUsdcAtomic(atomic: string): string {
  // BigInt literals (1_000_000n) need an ES2020+ target; this project's
  // tsconfig targets ES2017, so BigInt(1_000_000) (a runtime call, not a
  // literal) is used instead, same value, no tsconfig change needed.
  const divisor = BigInt(1_000_000);
  const value = BigInt(atomic);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** GET /v1/risk-score/:address with no payment proof: always returns
 * the 402 quote (the resource is never released for free). */
export async function fetchRiskScoreQuote(network: ApiNetwork, address: string): Promise<X402Requirement> {
  const res = await fetch(`${API_BASE_URL}/v1/risk-score/${address}`);
  if (res.status !== 402) {
    throw new Error(`Expected a 402 payment-required quote, got ${res.status}`);
  }
  const body = (await res.json()) as X402PaymentRequiredBody;
  const requirement = body.accepts[0];
  if (!requirement) throw new Error("402 response had no payment requirements");
  return requirement;
}

/** Retries GET /v1/risk-score/:address with proof of payment attached.
 * A freshly-settled payment can occasionally outrace Vouch402's own RPC
 * read of it (the same public-RPC-lag class of issue documented
 * elsewhere in DECISION_LOG.md), retried a few times with a short delay
 * on a 402 specifically, since that's the server's own "not confirmed
 * yet, retry shortly" signal, not a hard failure. */
export async function fetchRiskScoreWithProof(
  address: string,
  proof: { resourceId: string; txHash: string; payer: string }
): Promise<RiskScoreResult> {
  const header =
    typeof window !== "undefined" ? window.btoa(JSON.stringify(proof)) : Buffer.from(JSON.stringify(proof)).toString("base64");

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${API_BASE_URL}/v1/risk-score/${address}`, {
      headers: { "X-PAYMENT": header },
    });
    if (res.ok) return res.json();

    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (res.status === 402 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  // Unreachable given the loop above always returns or throws, but keeps
  // TypeScript's control-flow analysis happy.
  throw new Error("Exhausted retries confirming payment");
}
