import { createPublicClient, http, type PublicClient } from "viem";
import { base, baseSepolia } from "viem/chains";
import { env, rpcUrlFor, type NetworkName } from "./env";

const clients = new Map<NetworkName, PublicClient>();

/**
 * `mainnet.base.org` / `sepolia.base.org` are shared public RPCs fronted
 * by Cloudflare — observed returning transient 502s under normal use (see
 * DECISION_LOG.md). viem's default retry budget (3 attempts) isn't always
 * enough to ride that out; this widens it. Still only a mitigation, not a
 * fix — the build-on-base skill's own guidance is a dedicated node
 * provider for anything beyond local dev/testing.
 */
export function httpTransport(url: string) {
  if (!url.startsWith("https://")) {
    throw new Error(`Refusing non-HTTPS RPC endpoint: ${url}`);
  }
  return http(url, { retryCount: 6, retryDelay: 750, timeout: 20_000 });
}

/**
 * Returns a viem PublicClient for the given Base network. HTTPS-only RPC
 * per the build-on-base skill's safety guardrails; chain ID is bound via
 * viem's `chain` config so responses are implicitly checked against it.
 */
export function publicClientFor(network: NetworkName): PublicClient {
  const cached = clients.get(network);
  if (cached) return cached;

  const url = rpcUrlFor(network);

  // Cast: `base` and `baseSepolia` chain configs produce structurally
  // distinct (op-stack-extended) client types that don't unify under a
  // single `PublicClient` map value type, even though they're compatible
  // at runtime for the read-only calls this module makes.
  const client = createPublicClient({
    chain: network === "base" ? base : baseSepolia,
    transport: httpTransport(url),
  }) as PublicClient;
  clients.set(network, client);
  return client;
}

export function defaultNetwork(): NetworkName {
  return env.network;
}

/** Minimal ERC-20 ABI — just what payment verification and scoring need. */
export const erc20Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
