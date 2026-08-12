import { EAS, SchemaRegistry, ZERO_ADDRESS } from "@ethereum-attestation-service/eas-sdk";
import { JsonRpcProvider, Wallet as EthersWallet, type TransactionRequest, type TransactionResponse } from "ethers";
import { loadDeployerAccount } from "./keystore";
import { rpcUrlFor, type NetworkName } from "./env";
import { withAttribution } from "./attribution";

/**
 * EAS is natively deployed on Base (and Base Sepolia) as an OP Stack
 * predeploy — the same address on both networks. Verified against Base's
 * own contract-address docs and the eas-contracts deployment manifests
 * for `base` and `base-sepolia` (both list this address), not guessed.
 */
export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

/**
 * Every transaction Vouch402's own wallet sends goes through this signer
 * (schema registration, attestations) — overriding `sendTransaction` here
 * is the "client-level, not per-call" attribution point docs/TECHNICAL_SPEC.md
 * requires, without needing to reimplement what the EAS SDK builds
 * internally for each contract call.
 */
class AttributedWallet extends EthersWallet {
  override sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    return super.sendTransaction({ ...tx, data: withAttribution((tx.data as string) ?? "0x") });
  }
}

let cachedSigner: { network: NetworkName; signer: EthersWallet } | undefined;

/** ethers Signer for the deployer wallet, connected to the given network — used for every attest/register call. */
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
 * not for production"). In practice this means a read immediately after a
 * write can land on a backend node that hasn't caught up yet and come back
 * with a zeroed/not-found struct even though the write already landed —
 * confirmed by re-querying the same UID moments later. Retrying a couple
 * of times with backoff absorbs that without masking a genuinely missing
 * attestation (which stays not-found across retries too).
 */
export async function getAttestationWithRetry(
  eas: EAS,
  uid: string,
  { retries = 3, delayMs = 1500 }: { retries?: number; delayMs?: number } = {}
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const attestation = await eas.getAttestation(uid);
    if (attestation.attester !== ZERO_ADDRESS) {
      return attestation;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } else {
      return attestation; // exhausted retries — return the (possibly genuine) not-found result
    }
  }
  throw new Error("unreachable");
}
