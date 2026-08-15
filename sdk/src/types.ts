/** "base" = mainnet, "base-sepolia" = testnet. Matches the API's own
 * `network` field exactly, not a separate enum invented on this side. */
export type Network = "base" | "base-sepolia";

/** The single entry in a 402 response's `accepts` array. Field names and
 * shape verified directly against a live request to vouch402.fly.dev,
 * not written from memory. */
export interface X402Requirement {
  scheme: string;
  network: Network;
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

export interface RiskSignals {
  walletAgeDays: number;
  txCount: number;
  uniqueContractInteractions: number;
  flagged: boolean;
}

export interface RiskScoreResult {
  address: string;
  score: number;
  signals: RiskSignals;
  attestationUid: string;
}

/** Proof of payment sent back as the base64-encoded `X-PAYMENT` header on
 * the paid retry. */
export interface PaymentProof {
  resourceId: string;
  txHash: string;
  payer: string;
  /** Opt-in only: makes this result visible on Vouch402's public
   * activity feed (address, score, and signals). Omitted or false
   * keeps the default: attestation-only, no visible signals. See the
   * main repo's DECISION_LOG.md, "dev wallet / opt-in public results". */
  makePublic?: boolean;
}

/** The X402ServiceFulfillment attestation's decoded on-chain fields, as
 * independently resolved via EAS (not just trusted from the API's own
 * response). Matches the schema in docs/TECHNICAL_SPEC.md. */
export interface FulfillmentAttestation {
  uid: string;
  attester: string;
  recipient: string;
  revoked: boolean;
  schema: string;
  time: bigint;
}
