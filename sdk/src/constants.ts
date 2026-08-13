import type { Network } from "./types.js";

/** Vouch402's default live instance. Override via `RiskScoreOptions.baseUrl`
 * to point at a local/staging server instead. */
export const DEFAULT_API_BASE_URL = "https://vouch402.fly.dev";

/** EAS is natively deployed on Base (and Base Sepolia) as an OP Stack
 * predeploy, the same address on both networks. Mirrors src/lib/eas.ts
 * in the main Vouch402 repo (verified there against Base's own
 * contract-address docs before relying on it, not guessed). */
export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";

export function usdcAddressFor(network: Network): `0x${string}` {
  return network === "base"
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
}

export function chainIdFor(network: Network): number {
  return network === "base" ? 8453 : 84532;
}

export function rpcUrlFor(network: Network): string {
  return network === "base" ? "https://mainnet.base.org" : "https://sepolia.base.org";
}

export function easExplorerUrl(network: Network, uid: string): string {
  return `https://${network}.easscan.org/attestation/view/${uid}`;
}

/** Minimal ERC-20 ABI, just the one function this SDK ever calls. */
export const erc20TransferAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
