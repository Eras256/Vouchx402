import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export type NetworkName = "base-sepolia" | "base";

export const env = {
  network: (optional("NETWORK", "base-sepolia") as NetworkName),
  baseRpcUrl: optional("BASE_RPC_URL", "https://mainnet.base.org"),
  baseSepoliaRpcUrl: optional("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),

  port: Number(optional("PORT", "3402")),
  priceUsdc: optional("PRICE_USDC", "0.01"),
  // Legacy single value — still read as the Sepolia fallback below, and
  // used directly in a few places as "an address to test against" where
  // the security distinction below doesn't apply.
  payTo: optional("X402_PAY_TO_ADDRESS", ""),
  payToSepolia: optional("X402_PAY_TO_ADDRESS_SEPOLIA", ""),
  payToMainnet: optional("X402_PAY_TO_ADDRESS_MAINNET", ""),

  usdcSepolia: optional("USDC_ADDRESS_BASE_SEPOLIA", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  usdcMainnet: optional("USDC_ADDRESS_BASE_MAINNET", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),

  etherscanApiKey: optional("ETHERSCAN_API_KEY", ""),

  deployerKeystoreAccount: optional("DEPLOYER_KEYSTORE_ACCOUNT", ""),
  deployerKeystorePassword: optional("DEPLOYER_KEYSTORE_PASSWORD", ""),

  builderCode: optional("BASE_BUILDER_CODE", ""),

  easSchemaUidFulfillmentSepolia: optional("EAS_SCHEMA_UID_FULFILLMENT_SEPOLIA", ""),
  easSchemaUidDisputeSepolia: optional("EAS_SCHEMA_UID_DISPUTE_SEPOLIA", ""),
  easSchemaUidFulfillmentMainnet: optional("EAS_SCHEMA_UID_FULFILLMENT_MAINNET", ""),
  easSchemaUidDisputeMainnet: optional("EAS_SCHEMA_UID_DISPUTE_MAINNET", ""),

  dbPath: optional("DB_PATH", "./data/vouch402.sqlite"),

  requireEnv: required,
};

export function rpcUrlFor(network: NetworkName): string {
  return network === "base" ? env.baseRpcUrl : env.baseSepoliaRpcUrl;
}

export function chainIdFor(network: NetworkName): number {
  return network === "base" ? 8453 : 84532;
}

export function usdcAddressFor(network: NetworkName): `0x${string}` {
  return (network === "base" ? env.usdcMainnet : env.usdcSepolia) as `0x${string}`;
}

/**
 * Split from a single flat `payTo` deliberately (see DECISION_LOG.md):
 * the same wallet was serving as both the autonomous signer (its key
 * lives on the server, decrypted at runtime — has to be "hot") and the
 * treasury address that receives real payment revenue. Fine for testnet,
 * not something to carry into mainnet without a decision. Sepolia keeps
 * falling back to the legacy single value so nothing about the existing
 * test suite changes; mainnet has **no fallback** — it throws rather
 * than silently reusing the signer wallet as treasury.
 */
export function payToFor(network: NetworkName): string {
  if (network === "base") {
    if (!env.payToMainnet) {
      throw new Error(
        "X402_PAY_TO_ADDRESS_MAINNET is not configured. Mainnet intentionally does not fall back to " +
          "X402_PAY_TO_ADDRESS (the signer wallet) — set it to an address you actually control before switching NETWORK=base."
      );
    }
    return env.payToMainnet;
  }
  return env.payToSepolia || env.payTo;
}

export function explorerBaseFor(network: NetworkName): string {
  return network === "base" ? "https://basescan.org" : "https://sepolia.basescan.org";
}

/**
 * Etherscan's per-chain V1 endpoints (api.basescan.org/api,
 * api-sepolia.basescan.org/api) are deprecated — confirmed directly (a
 * live call returned `{"status":"0","message":"NOTOK","result":"...
 * deprecated V1 endpoint..."}`), not assumed. V2 unifies every chain
 * under one host with `chainid` selecting the network; Base's chain ID
 * doubles as the Etherscan V2 chainid, no separate mapping needed.
 */
export function etherscanApiBaseFor(_network: NetworkName): string {
  return "https://api.etherscan.io/v2/api";
}

// These two read `process.env` live (not the `env` snapshot above) because
// `registerSchemas()` (src/attestation/schemas.ts) can write a freshly
// registered UID mid-process — e.g. from the same test run that then
// immediately needs to use it. A frozen snapshot would miss that update
// until the process restarted.
export function easSchemaUidFulfillment(network: NetworkName): string {
  const key = network === "base" ? "EAS_SCHEMA_UID_FULFILLMENT_MAINNET" : "EAS_SCHEMA_UID_FULFILLMENT_SEPOLIA";
  return process.env[key] ?? "";
}

export function easSchemaUidDispute(network: NetworkName): string {
  const key = network === "base" ? "EAS_SCHEMA_UID_DISPUTE_MAINNET" : "EAS_SCHEMA_UID_DISPUTE_SEPOLIA";
  return process.env[key] ?? "";
}
