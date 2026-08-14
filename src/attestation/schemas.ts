import fs from "node:fs";
import path from "node:path";
import { ZERO_ADDRESS } from "@ethereum-attestation-service/eas-sdk";
import { getSchemaRegistry } from "../lib/eas";
import { env, easSchemaUidFulfillment, easSchemaUidDispute, type NetworkName } from "../lib/env";

/**
 * x402-SAP schemas (docs/TECHNICAL_SPEC.md). Non-revocable: attestations
 * are meant to be an immutable record: a disagreement is a *new*, linked
 * X402ServiceDispute attestation, never a revocation of the original.
 */
export const FULFILLMENT_SCHEMA =
  "address payer,address payee,bytes32 x402PaymentRef,bytes32 resourceId,uint8 status,bytes32 responseHash,uint64 fulfilledAt";
export const DISPUTE_SCHEMA = "bytes32 refUID,address disputant,uint8 reasonCode,string details";

const ENV_PATH = path.resolve(__dirname, "..", "..", ".env");

type SchemaKind = "fulfillment" | "dispute";

const ENV_KEY_BY_SCHEMA: Record<SchemaKind, (network: NetworkName) => string> = {
  fulfillment: (n) => (n === "base" ? "EAS_SCHEMA_UID_FULFILLMENT_MAINNET" : "EAS_SCHEMA_UID_FULFILLMENT_SEPOLIA"),
  dispute: (n) => (n === "base" ? "EAS_SCHEMA_UID_DISPUTE_MAINNET" : "EAS_SCHEMA_UID_DISPUTE_SEPOLIA"),
};

function updateEnvFile(key: string, value: string) {
  let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) {
    contents = contents.replace(re, line);
  } else {
    contents = contents.trimEnd() + `\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, contents);
  // Also update the live process so callers in this same run see it
  // immediately, without waiting for a restart to re-read the file.
  process.env[key] = value;
}

async function registerIfNeeded(network: NetworkName, kind: SchemaKind, schema: string): Promise<string> {
  const existing = kind === "fulfillment" ? easSchemaUidFulfillment(network) : easSchemaUidDispute(network);
  if (existing) {
    console.log(`[schemas] ${kind} already registered on ${network}: ${existing}`);
    return existing;
  }

  const registry = getSchemaRegistry(network);
  console.log(`[schemas] registering ${kind} schema on ${network}...`);
  const tx = await registry.register({ schema, resolverAddress: ZERO_ADDRESS, revocable: false });
  const uid = await tx.wait();
  console.log(`[schemas] ${kind} registered on ${network}: ${uid}`);
  updateEnvFile(ENV_KEY_BY_SCHEMA[kind](network), uid);
  return uid;
}

/** Idempotent: registers each schema once per network, reusing whatever UID is already in .env. */
export async function registerSchemas(network: NetworkName) {
  const fulfillmentUid = await registerIfNeeded(network, "fulfillment", FULFILLMENT_SCHEMA);
  const disputeUid = await registerIfNeeded(network, "dispute", DISPUTE_SCHEMA);
  return { fulfillmentUid, disputeUid };
}

if (require.main === module) {
  const network = (process.argv[2] as NetworkName | undefined) || env.network;
  registerSchemas(network)
    .then(({ fulfillmentUid, disputeUid }) => {
      console.log(`[schemas] done. fulfillment=${fulfillmentUid} dispute=${disputeUid}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
