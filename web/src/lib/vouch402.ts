// Small, stable helpers mirroring src/lib/env.ts on the API side — this
// is a separate npm project (no shared workspace/build step between the
// two), so these are intentionally duplicated rather than imported.

export const API_BASE_URL = "https://vouch402.fly.dev";

export type ApiNetwork = "base" | "base-sepolia";

/** Maps the navbar's Testnet/Mainnet selector to the API's network name. */
export function toApiNetwork(uiNetwork: "testnet" | "mainnet"): ApiNetwork {
  return uiNetwork === "mainnet" ? "base" : "base-sepolia";
}

/** Verified live: both `base` and `base-sepolia` easscan.org subdomains
 * resolve to real attestations — see DECISION_LOG.md. */
export function easExplorerUrl(network: ApiNetwork, uid: string): string {
  return `https://${network}.easscan.org/attestation/view/${uid}`;
}

export function basescanTxUrl(network: ApiNetwork, txHash: string): string {
  return network === "base" ? `https://basescan.org/tx/${txHash}` : `https://sepolia.basescan.org/tx/${txHash}`;
}

// ---- Checkpoint 7c: Live stats + Recent activity ----
// Mirrors src/lib/db.ts's real shapes (getMetrics/getRecentActivity) and
// src/server/app.ts's actual response bodies — verified live against
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
