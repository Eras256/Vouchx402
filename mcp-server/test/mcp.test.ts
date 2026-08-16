import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { pay, type X402Requirement } from "vouch402-sdk";
// Test-only reuse of the main repo's own server + funded testnet
// wallet, same pattern as sdk/test/sdk.test.ts: never shipped (see
// package.json "files"), and never hits the live mainnet-only API.
import { createApp } from "../../src/server/app.js";
import { loadDeployerAccount } from "../../src/lib/keystore.js";
import { env } from "../../src/lib/env.js";

const mcpServerDir = fileURLToPath(new URL("..", import.meta.url));

describe("vouch402-mcp-server (Base Sepolia, real payments, real MCP client)", () => {
  let httpServer: Server;
  let baseUrl: string;
  let client: Client;

  beforeAll(async () => {
    if (env.network !== "base-sepolia") {
      throw new Error(`Refusing to run: NETWORK=${env.network}, expected base-sepolia for this test.`);
    }
    const app = createApp();
    await new Promise<void>((resolve) => {
      httpServer = app.listen(0, () => resolve());
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;

    // Drives the server through the real MCP wire protocol (JSON-RPC
    // over stdio), the same client SDK a real MCP host would use, not
    // a direct function call into the server's own handler code.
    client = new Client({ name: "vouch402-mcp-server-test-client", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(mcpServerDir, "dist", "index.js")],
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("lists exactly the two documented tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["fetch_risk_score", "get_payment_quote"]);
  });

  it("runs quote -> pay -> fetch through real MCP tool calls, server never pays", async () => {
    const { account } = loadDeployerAccount();
    const address = env.payTo;

    const quoteResult = await client.callTool({
      name: "get_payment_quote",
      arguments: { address, baseUrl },
    });
    expect(quoteResult.isError).not.toBe(true);
    const quote = quoteResult.structuredContent as unknown as X402Requirement;
    expect(quote.network).toBe("base-sepolia");
    expect(quote.extra.resourceId).toMatch(/^0x[0-9a-f]{64}$/);

    // The tool call above never touched a key. Paying here, with the
    // SDK's own pay(), stands in for "the calling agent's own wallet
    // tooling" the design in DECISION_LOG.md assumes.
    const txHash = await pay(quote, account);

    const scoreResult = await client.callTool({
      name: "fetch_risk_score",
      arguments: { address, quote, txHash, payer: account.address, baseUrl, jurisdictionAttestation: true },
    });
    expect(scoreResult.isError).not.toBe(true);
    const data = scoreResult.structuredContent as {
      score: number;
      attestationUid: string;
      verified: boolean;
      explorerUrl: string;
    };
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data.attestationUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(data.verified).toBe(true);
    expect(data.explorerUrl).toContain(data.attestationUid);
  }, 60_000);
});
