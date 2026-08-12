import { recoverMessageAddress } from "viem";
import { SchemaEncoder, ZERO_ADDRESS } from "@ethereum-attestation-service/eas-sdk";
import { getEas, getAttestationWithRetry } from "../lib/eas";
import { easSchemaUidDispute, type NetworkName } from "../lib/env";
import { FULFILLMENT_SCHEMA, DISPUTE_SCHEMA } from "./schemas";

export class DisputeError extends Error {}

/** Mirrors the `reasonCode` field of X402ServiceDispute in docs/TECHNICAL_SPEC.md. */
export enum DisputeReasonCode {
  NonDelivery = 0,
  MalformedResponse = 1,
  StaleData = 2,
  Other = 3,
}

export interface SubmitDisputeParams {
  network: NetworkName;
  refUID: string;
  reasonCode: DisputeReasonCode;
  details: string;
  /** EIP-191 personal_sign signature over disputeMessage(refUID, reasonCode, details). */
  signature: `0x${string}`;
}

export function disputeMessage(refUID: string, reasonCode: number, details: string): string {
  return `Vouch402 dispute\nrefUID: ${refUID}\nreasonCode: ${reasonCode}\ndetails: ${details}`;
}

/**
 * Files an X402ServiceDispute attestation against a referenced
 * X402ServiceFulfillment. Per docs/TECHNICAL_SPEC.md: "The caller must be
 * the original payer on the referenced fulfillment attestation (verified
 * via signature, not a claimed address)" — the disputant identity here is
 * *recovered from the signature itself*, never taken from a request field,
 * so there's nothing for a caller to lie about.
 */
export async function submitDispute(params: SubmitDisputeParams): Promise<{ uid: string; disputant: string }> {
  const schemaUid = easSchemaUidDispute(params.network);
  if (!schemaUid) {
    throw new DisputeError(
      `No X402ServiceDispute schema UID configured for ${params.network}. Run: npm run register:schemas -- ${params.network}`
    );
  }

  const message = disputeMessage(params.refUID, params.reasonCode, params.details);
  const disputant = await recoverMessageAddress({ message, signature: params.signature });

  const eas = getEas(params.network);
  // Retried: a dispute filed soon after its fulfillment can otherwise race
  // public-RPC read lag and be wrongly rejected as "unknown attestation".
  const fulfillment = await getAttestationWithRetry(eas, params.refUID);
  if (!fulfillment || fulfillment.attester === ZERO_ADDRESS) {
    throw new DisputeError(`Unknown fulfillment attestation: ${params.refUID}`);
  }

  const decoded = new SchemaEncoder(FULFILLMENT_SCHEMA).decodeData(fulfillment.data);
  const payerItem = decoded.find((item) => item.name === "payer");
  const recordedPayer = payerItem?.value.value as string | undefined;
  if (!recordedPayer) {
    throw new DisputeError("Could not decode payer from the referenced fulfillment attestation");
  }
  if (recordedPayer.toLowerCase() !== disputant.toLowerCase()) {
    throw new DisputeError("Signature does not match the original payer on the referenced fulfillment attestation");
  }

  const encoder = new SchemaEncoder(DISPUTE_SCHEMA);
  const data = encoder.encodeData([
    { name: "refUID", type: "bytes32", value: params.refUID },
    { name: "disputant", type: "address", value: disputant },
    { name: "reasonCode", type: "uint8", value: params.reasonCode },
    { name: "details", type: "string", value: params.details },
  ]);

  const tx = await eas.attest({
    schema: schemaUid,
    data: {
      recipient: fulfillment.attester, // the service (payee) this dispute concerns
      expirationTime: 0n,
      revocable: false,
      refUID: params.refUID, // native EAS link back to the disputed attestation
      data,
    },
  });
  const uid = await tx.wait();

  return { uid, disputant };
}
