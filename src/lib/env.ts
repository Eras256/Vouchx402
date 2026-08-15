import dotenv from "dotenv";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });
// .env.local is optional and loaded second, with override: standard
// convention (Next.js/Vite/CRA all do this): .env is the tracked-in-spirit
// baseline (still gitignored here, but the "normal" file), .env.local is
// for values you don't want duplicated across files (e.g. only what's
// new/different for a mainnet cutover). Missing keys in .env.local simply
// keep whatever .env already set: this never blanks out a value, only
// overrides the ones actually present here.
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

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
  // Legacy single value, still read as the Sepolia fallback below, and
  // used directly in a few places as "an address to test against" where
  // the security distinction below doesn't apply.
  payTo: optional("X402_PAY_TO_ADDRESS", ""),
  payToSepolia: optional("X402_PAY_TO_ADDRESS_SEPOLIA", ""),
  payToMainnet: optional("X402_PAY_TO_ADDRESS_MAINNET", ""),

  usdcSepolia: optional("USDC_ADDRESS_BASE_SEPOLIA", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  usdcMainnet: optional("USDC_ADDRESS_BASE_MAINNET", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),

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
 * lives on the server, decrypted at runtime, has to be "hot") and the
 * treasury address that receives real payment revenue. Fine for testnet,
 * not something to carry into mainnet without a decision. Sepolia keeps
 * falling back to the legacy single value so nothing about the existing
 * test suite changes; mainnet has **no fallback**: it throws rather
 * than silently reusing the signer wallet as treasury.
 */
export function payToFor(network: NetworkName): string {
  if (network === "base") {
    if (!env.payToMainnet) {
      throw new Error(
        "X402_PAY_TO_ADDRESS_MAINNET is not configured. Mainnet intentionally does not fall back to " +
          "X402_PAY_TO_ADDRESS (the signer wallet); set it to an address you actually control before switching NETWORK=base."
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
 * EAS's own explorer, not BaseScan: for viewing an attestation's decoded
 * fields directly rather than raw calldata. The subdomain happens to
 * equal the `NetworkName` value itself ("base" / "base-sepolia"),
 * verified both resolve to real attestations before relying on this,
 * not assumed from the mainnet one alone.
 */
export function easExplorerAttestationUrl(network: NetworkName, uid: string): string {
  return `https://${network}.easscan.org/attestation/view/${uid}`;
}

/**
 * Etherscan's unified V2 API worked for this (see DECISION_LOG.md for
 * the earlier V1-deprecation finding), but Etherscan dropped free-tier
 * access to Base in November 2025; confirmed live, not assumed (a real
 * call with a real key returned `{"status":"0","message":"NOTOK",
 * "result":"Free API access is not supported for this chain..."}`).
 * Base's own public Blockscout instances speak the same Etherscan-
 * compatible `module=account&action=txlist` shape, need no API key at
 * all, and were verified directly against real addresses on both
 * networks before switching. See DECISION_LOG.md for the full
 * before/after.
 */
export function blockscoutApiBaseFor(network: NetworkName): string {
  return network === "base" ? "https://base.blockscout.com/api" : "https://base-sepolia.blockscout.com/api";
}

// These two read `process.env` live (not the `env` snapshot above) because
// `registerSchemas()` (src/attestation/schemas.ts) can write a freshly
// registered UID mid-process, e.g. from the same test run that then
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
