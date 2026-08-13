#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getQuote, fetchScore, verifyAttestation, easExplorerUrl, type Network, type X402Requirement } from "vouch402-sdk";

// This server never holds a wallet or signs anything itself: see
// DECISION_LOG.md, "Phase 10 open question: how should the standalone
// MCP server pay?". get_payment_quote returns an unsigned quote; the
// calling agent pays with its own wallet tooling; fetch_risk_score
// takes the resulting txHash and completes the flow.

const quoteShape = {
  scheme: z.string(),
  network: z.enum(["base", "base-sepolia"]),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number(),
  asset: z.string(),
  extra: z.object({ name: z.string(), resourceId: z.string() }),
};

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], structuredContent };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const server = new McpServer({ name: "vouch402", version: "0.1.0" });

server.registerTool(
  "get_payment_quote",
  {
    title: "Get a Vouch402 payment quote",
    description:
      "Get the x402 payment requirements for a risk score on a Base address. Returns an unsigned quote: pay maxAmountRequired of the asset token to payTo on the given network yourself, then call fetch_risk_score with the resulting transaction hash. This tool never pays on your behalf.",
    inputSchema: {
      address: z.string().describe("The Base address to evaluate"),
      baseUrl: z.string().optional().describe("Override the Vouch402 API base URL (defaults to the live mainnet instance)"),
    },
  },
  async ({ address, baseUrl }) => {
    try {
      const quote = await getQuote(address, { baseUrl });
      return textResult(
        `Pay ${quote.maxAmountRequired} of ${quote.asset} to ${quote.payTo} on ${quote.network}, then call fetch_risk_score with this same quote, the resulting txHash, and the paying address.`,
        quote as unknown as Record<string, unknown>
      );
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  }
);

server.registerTool(
  "fetch_risk_score",
  {
    title: "Fetch a Vouch402 risk score with proof of payment",
    description:
      "Complete the flow after paying a quote from get_payment_quote: submits proof of payment, retries until the payment is confirmed server-side, then independently verifies the resulting attestation directly against EAS rather than trusting the API's own response.",
    inputSchema: {
      address: z.string().describe("The same address passed to get_payment_quote"),
      quote: z.object(quoteShape).describe("The exact quote object returned by get_payment_quote"),
      txHash: z.string().describe("The transaction hash of the on-chain payment you submitted"),
      payer: z.string().describe("The address that sent the payment"),
      baseUrl: z.string().optional().describe("Override the Vouch402 API base URL, must match the one used for the quote"),
    },
  },
  async ({ address, quote, txHash, payer, baseUrl }) => {
    try {
      const result = await fetchScore(address, quote as X402Requirement, txHash, payer, { baseUrl });
      // verifyAttestation only returns once it resolves a real, non-zero
      // attester on EAS (its own retry loop guards against a false
      // "not found" from public-RPC read-after-write lag); reaching this
      // line without it throwing is itself the independent proof.
      const attestation = await verifyAttestation(result.attestationUid, quote.network as Network);
      const verified = !attestation.revoked;
      return textResult(
        `Score ${result.score} for ${result.address}. Attestation ${result.attestationUid} independently verified on EAS: ${verified ? "yes" : "no"}. Explorer: ${easExplorerUrl(quote.network as Network, result.attestationUid)}`,
        { ...result, verified, explorerUrl: easExplorerUrl(quote.network as Network, result.attestationUid) }
      );
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
