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
