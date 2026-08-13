export {
  getQuote,
  pay,
  fetchScore,
  verifyAttestation,
  getRiskScore,
  type GetQuoteOptions,
  type FetchScoreOptions,
  type VerifyAttestationOptions,
  type GetRiskScoreOptions,
  type GetRiskScoreResult,
} from "./client.js";

export {
  DEFAULT_API_BASE_URL,
  EAS_ADDRESS,
  usdcAddressFor,
  chainIdFor,
  rpcUrlFor,
  easExplorerUrl,
} from "./constants.js";

export type {
  Network,
  X402Requirement,
  X402PaymentRequiredBody,
  RiskSignals,
  RiskScoreResult,
  PaymentProof,
  FulfillmentAttestation,
} from "./types.js";
