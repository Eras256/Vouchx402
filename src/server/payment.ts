import { decodeEventLog, TransactionReceiptNotFoundError, type Hash } from "viem";
import { publicClientFor, erc20Abi } from "../lib/chain";
import { getQuote, consumeQuote, isPaymentProcessed, markPaymentProcessed } from "../lib/db";
import type { NetworkName } from "../lib/env";
import type { PaymentProof } from "./x402";

export class PaymentVerificationError extends Error {}

export interface VerifiedPayment {
  resourceId: string;
  payer: string;
  payTo: string;
  amountAtomic: bigint;
  txHash: string;
  address: string;
}

/**
 * Server-side payment verification, mandatory before releasing any paid
 * resource (docs/TECHNICAL_SPEC.md "Payment verification"):
 *   1. reject already-processed tx hashes (replay protection)
 *   2. confirm the payment settled on-chain
 *   3. confirm the paying address matches the request's claimed payer
 *   4. confirm amount and recipient match the quoted 402 requirements
 *   5. mark processed BEFORE the caller returns the resource
 *
 * Never trusts the client's claim alone — every field is re-derived from
 * the on-chain transaction receipt itself.
 */
export async function verifyPayment(network: NetworkName, proof: PaymentProof): Promise<VerifiedPayment> {
  const quote = getQuote(proof.resourceId);
  if (!quote) throw new PaymentVerificationError("Unknown or expired resourceId");
  if (quote.consumedAt) throw new PaymentVerificationError("Quote already consumed");
  if (Date.now() > quote.expiresAt) throw new PaymentVerificationError("Quote expired");
  if (quote.network !== network) throw new PaymentVerificationError("Network mismatch for quote");

  // 1. Replay protection — reject if this tx was already used to pay for something.
  if (isPaymentProcessed(proof.txHash)) {
    throw new PaymentVerificationError("Payment already processed (replay)");
  }

  const client = publicClientFor(network);

  // 2. Confirm the payment actually settled. A tx that hasn't been mined
  // yet is a client-retry case (402), not a server fault (500).
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: proof.txHash as Hash });
  } catch (err) {
    if (err instanceof TransactionReceiptNotFoundError) {
      throw new PaymentVerificationError("Payment transaction not yet confirmed on-chain; retry shortly.");
    }
    throw err;
  }
  if (receipt.status !== "success") {
    throw new PaymentVerificationError(`Payment transaction did not succeed: status=${receipt.status}`);
  }

  const claimedPayer = proof.payer.toLowerCase();

  // Look for a matching ERC-20 Transfer log on the quoted asset contract.
  let matched: { from: string; to: string; value: bigint } | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== quote.asset.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
      const from = (decoded.args.from as string).toLowerCase();
      const to = (decoded.args.to as string).toLowerCase();
      const value = decoded.args.value as bigint;

      // 3. Sender matches the request's claimed payer.
      if (from !== claimedPayer) continue;
      // 4a. Recipient matches what was quoted.
      if (to !== quote.payTo.toLowerCase()) continue;

      matched = { from, to, value };
      break;
    } catch {
      // not a Transfer log on this contract's ABI shape — skip
      continue;
    }
  }

  if (!matched) {
    throw new PaymentVerificationError(
      "No matching USDC Transfer log found from the claimed payer to the quoted payTo address"
    );
  }

  // 4b. Amount matches (>=) what was quoted.
  const required = BigInt(quote.amountAtomic);
  if (matched.value < required) {
    throw new PaymentVerificationError(
      `Payment amount too low: got ${matched.value.toString()}, required ${required.toString()}`
    );
  }

  // 5. Mark processed BEFORE the caller releases the resource.
  markPaymentProcessed({
    txHash: proof.txHash,
    resourceId: proof.resourceId,
    payer: matched.from,
    payTo: matched.to,
    amountAtomic: matched.value.toString(),
    network,
  });
  consumeQuote(proof.resourceId);

  return {
    resourceId: proof.resourceId,
    payer: matched.from,
    payTo: matched.to,
    amountAtomic: matched.value,
    txHash: proof.txHash,
    address: quote.address,
  };
}
