import { EAS, SchemaRegistry, ZERO_ADDRESS } from "@ethereum-attestation-service/eas-sdk";
import { JsonRpcProvider, Wallet as EthersWallet, type TransactionRequest, type TransactionResponse } from "ethers";
import { loadDeployerAccount } from "./keystore";
import { rpcUrlFor, type NetworkName } from "./env";
import { withAttribution } from "./attribution";

/**
 * EAS is natively deployed on Base (and Base Sepolia) as an OP Stack
 * predeploy: the same address on both networks. Verified against Base's
 * own contract-address docs and the eas-contracts deployment manifests
 * for `base` and `base-sepolia` (both list this address), not guessed.
 */
export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

/**
 * Same class of public-RPC inconsistency as `getAttestationWithRetry`
 * below, on the write path this time: a payment tx confirms via one RPC
 * call, then the very next `sendTransaction` (for the fulfillment
 * attestation, same address) reads "pending" nonce from a Cloudflare
 * backend node that hasn't caught up yet, computes an already-used nonce,
 * and the resend is rejected as `REPLACEMENT_UNDERPRICED`, observed live
 * against `sepolia.base.org` (see DECISION_LOG.md), not hypothetical.
 * Retrying re-triggers ethers' own nonce lookup from scratch each time,
 * which self-heals once propagation catches up.
 */
async function withNonceRetry<T>(fn: () => Promise<T>, { retries = 4, delayMs = 800 }: { retries?: number; delayMs?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = (err as { shortMessage?: string })?.shortMessage ?? "";
      const isNonceRace = code === "REPLACEMENT_UNDERPRICED" || code === "NONCE_EXPIRED" || /nonce|replacement/i.test(message);
      if (!isNonceRace || attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}

/**
 * Every transaction Vouch402's own wallet sends goes through this signer
 * (schema registration, attestations); overriding `sendTransaction` here
 * is the "client-level, not per-call" attribution point docs/TECHNICAL_SPEC.md
 * requires, without needing to reimplement what the EAS SDK builds
 * internally for each contract call.
 */
class AttributedWallet extends EthersWallet {
  override sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const attributedTx = { ...tx, data: withAttribution((tx.data as string) ?? "0x") };
    // Re-invoking super.sendTransaction on each retry re-derives the
    // nonce from scratch (never reuses a stale one from a prior attempt).
    return withNonceRetry(() => super.sendTransaction(attributedTx));
  }
}

let cachedSigner: { network: NetworkName; signer: EthersWallet } | undefined;

/** ethers Signer for the deployer wallet, connected to the given network: used for every attest/register call. */
export function getEasSigner(network: NetworkName): EthersWallet {
  if (cachedSigner?.network === network) return cachedSigner.signer;
  const { privateKey } = loadDeployerAccount();
  const provider = new JsonRpcProvider(rpcUrlFor(network));
  const signer = new AttributedWallet(privateKey, provider);
  cachedSigner = { network, signer };
  return signer;
}

export function getEas(network: NetworkName): EAS {
  return new EAS(EAS_ADDRESS).connect(getEasSigner(network));
}

export function getSchemaRegistry(network: NetworkName): SchemaRegistry {
  return new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS).connect(getEasSigner(network));
}

/**
 * `sepolia.base.org` / `mainnet.base.org` are shared, load-balanced public
 * RPC endpoints (the build-on-base skill's own guidance: "rate-limited...
 * not for production"). Two distinct failure modes observed live, both
 * handled here:
 *  1. A read immediately after a write lands on a backend node that
 *     hasn't caught up yet and comes back with a zeroed/not-found struct
 *     even though the write already landed, confirmed by re-querying
 *     the same UID moments later.
 *  2. The request itself fails outright (a bare Cloudflare 502): this
 *     throws rather than returning a struct at all, so it needs its own
 *     catch, not just the not-found check above. Missed this the first
 *     time (only handled case 1) until `scripts/demo.ts` hit exactly this
 *     mid-run and the retry loop didn't catch it; see DECISION_LOG.md.
 */
export async function getAttestationWithRetry(
  eas: EAS,
  uid: string,
  { retries = 3, delayMs = 1500 }: { retries?: number; delayMs?: number } = {}
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const attestation = await eas.getAttestation(uid);
      if (attestation.attester !== ZERO_ADDRESS || attempt >= retries) {
        return attestation; // found, or exhausted retries on a possibly-genuine not-found
      }
    } catch (err) {
      if (attempt >= retries) throw err; // exhausted retries: surface the real error
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("unreachable");
}
