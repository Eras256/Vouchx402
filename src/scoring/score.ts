import { isAddress } from "viem";
import { publicClientFor } from "../lib/chain";
import { blockscoutApiBaseFor, type NetworkName } from "../lib/env";
import flaggedList from "./flagged-addresses.json";

export interface RiskSignals {
  walletAgeDays: number;
  txCount: number;
  uniqueContractInteractions: number;
  flagged: boolean;
}

export interface RiskResult {
  score: number;
  signals: RiskSignals;
}

interface ExplorerTx {
  timeStamp: string;
  to: string;
  from: string;
  input: string;
}

/**
 * Pulls the address's transaction history via Base's public Blockscout
 * instance (see DECISION_LOG.md), using its Etherscan-compatible
 * `account txlist` shape (sorted ascending, so `[0]` is the earliest
 * tx). Plain JSON-RPC has no "first tx" query, which is why an explorer
 * API is needed for that specific signal. No API key required. Returns
 * [] if the request fails, rate-limits, or the address has no history
 * (fresh wallet): a degraded signal, never a hard error.
 */
async function fetchTxHistory(network: NetworkName, address: string, max = 200): Promise<ExplorerTx[]> {
  const url = new URL(blockscoutApiBaseFor(network));
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "99999999");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(max));
  url.searchParams.set("sort", "asc");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const body = (await res.json()) as { status: string; result: ExplorerTx[] | string };
  if (body.status !== "1" || !Array.isArray(body.result)) return [];
  return body.result;
}

function isFlagged(address: string): boolean {
  const lower = address.toLowerCase();
  return (flaggedList.addresses as string[]).some((a) => a.toLowerCase() === lower);
}

/**
 * Pure scoring formula, deliberately separated from the network-fetching
 * logic below so it's unit-testable without an RPC/BaseScan dependency;
 * everything else in this codebase that touches the network inherits the
 * public Base Sepolia RPC's observed flakiness (see DECISION_LOG.md); this
 * function can't, by construction.
 *
 * `score` is 0-100 risk (higher = riskier). Age/activity/diversity reduce
 * risk (an established, active, diverse wallet looks less like a fresh
 * throwaway/sybil address); flagged membership forces risk to the top of
 * the range regardless of the other signals.
 */
export function scoreFromSignals(signals: RiskSignals): number {
  // Trust sub-score (0-100), each signal capped so no single one dominates.
  const ageTrust = Math.min(40, signals.walletAgeDays / 3); // ~120+ days -> full 40
  const activityTrust = Math.min(30, signals.txCount);
  const diversityTrust = Math.min(30, signals.uniqueContractInteractions * 3);
  const trust = Math.min(100, ageTrust + activityTrust + diversityTrust);

  let score = Math.round(100 - trust);
  if (signals.flagged) score = Math.max(score, 95);
  return Math.max(0, Math.min(100, score));
}

/**
 * v0 risk heuristic. NOT a complete risk model: see docs/TECHNICAL_SPEC.md
 * "Known v0 limitation" framing for the scoring signals themselves (the
 * flag list is bundled separately and versioned; see flagged-addresses.json).
 */
export async function computeRiskScore(network: NetworkName, address: string): Promise<RiskResult> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const client = publicClientFor(network);

  const [txCount, history] = await Promise.all([
    client.getTransactionCount({ address: address as `0x${string}` }),
    fetchTxHistory(network, address),
  ]);

  let walletAgeDays = 0;
  if (history.length > 0) {
    const firstTs = Number(history[0].timeStamp) * 1000;
    walletAgeDays = Math.max(0, Math.floor((Date.now() - firstTs) / 86_400_000));
  }

  const uniqueTo = new Set<string>();
  for (const tx of history) {
    if (tx.to && tx.input && tx.input !== "0x") {
      uniqueTo.add(tx.to.toLowerCase());
    }
  }
  const uniqueContractInteractions = uniqueTo.size;

  const flagged = isFlagged(address);

  const signals: RiskSignals = { walletAgeDays, txCount, uniqueContractInteractions, flagged };

  return { score: scoreFromSignals(signals), signals };
}
