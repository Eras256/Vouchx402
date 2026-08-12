import { keccak256, toBytes } from "viem";
import { SchemaEncoder, ZERO_BYTES32 } from "@ethereum-attestation-service/eas-sdk";
import { getEas } from "../lib/eas";
import { easSchemaUidFulfillment, type NetworkName } from "../lib/env";
import { FULFILLMENT_SCHEMA } from "./schemas";

/** Mirrors the `status` field of X402ServiceFulfillment in docs/TECHNICAL_SPEC.md. */
export enum FulfillmentStatus {
  Fulfilled = 0,
  Timeout = 1,
  Error = 2,
}

export interface AttestFulfillmentParams {
  network: NetworkName;
  payer: string;
  payee: string;
  /** bytes32 reference tying this attestation to the settled payment — the payment tx hash fits directly. */
  x402PaymentRef: string;
  resourceId: string;
  status: FulfillmentStatus;
  /** The exact payload returned to the payer (attestationUid field excluded — see hashResponsePayload). */
  responsePayload: unknown;
}

/**
 * keccak256 of the exact response payload, so any party can independently
 * verify what was actually returned without the attestation itself having
 * to carry the (possibly larger, possibly evolving-shape) response body.
 */
export function hashResponsePayload(payload: unknown): `0x${string}` {
  return keccak256(toBytes(JSON.stringify(payload)));
}

/**
 * Emits an X402ServiceFulfillment attestation immediately after a paid
 * request is fulfilled (or fails after payment was already verified) —
 * see docs/TECHNICAL_SPEC.md "x402-SAP". Runs synchronously in the
 * request path (not fire-and-forget) because the resulting UID is part of
 * the response body the payer receives.
 */
export async function attestFulfillment(
  params: AttestFulfillmentParams
): Promise<{ uid: string; responseHash: `0x${string}` }> {
  const schemaUid = easSchemaUidFulfillment(params.network);
  if (!schemaUid) {
    throw new Error(
      `No X402ServiceFulfillment schema UID configured for ${params.network}. Run: npm run register:schemas -- ${params.network}`
    );
  }

  const responseHash = hashResponsePayload(params.responsePayload);

  const encoder = new SchemaEncoder(FULFILLMENT_SCHEMA);
  const data = encoder.encodeData([
    { name: "payer", type: "address", value: params.payer },
    { name: "payee", type: "address", value: params.payee },
    { name: "x402PaymentRef", type: "bytes32", value: params.x402PaymentRef },
    { name: "resourceId", type: "bytes32", value: params.resourceId },
    { name: "status", type: "uint8", value: params.status },
    { name: "responseHash", type: "bytes32", value: responseHash },
    { name: "fulfilledAt", type: "uint64", value: BigInt(Math.floor(Date.now() / 1000)) },
  ]);

  const eas = getEas(params.network);
  const tx = await eas.attest({
    schema: schemaUid,
    data: {
      recipient: params.payer,
      expirationTime: 0n,
      revocable: false,
      refUID: ZERO_BYTES32,
      data,
    },
  });
  const uid = await tx.wait();

  return { uid, responseHash };
}
