#!/usr/bin/env node
import { getRiskScore, easExplorerUrl } from "vouch402-sdk";
import { loadKeystoreAccount } from "./keystore.js";

function printHelp(): void {
  console.log(`vouch402: evaluate an address's Vouch402 risk score

Usage:
  vouch402 score <address> [--base-url <url>]

Pays for and fetches a live risk score for a Base address, then
independently verifies the resulting attestation on EAS.

Requires a funded wallet, loaded from a Foundry keystore (never a raw
private key):
  VOUCH402_KEYSTORE_ACCOUNT    keystore name under ~/.foundry/keystores
  VOUCH402_KEYSTORE_PASSWORD   keystore password
  VOUCH402_KEYSTORE_JSON       (alternative) keystore file contents, inline
`);
}

function parseArgs(argv: string[]): { address?: string; baseUrl?: string } {
  const [, address] = argv;
  let baseUrl: string | undefined;
  const flagIndex = argv.indexOf("--base-url");
  if (flagIndex !== -1) baseUrl = argv[flagIndex + 1];
  return { address, baseUrl };
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  if (command !== "score") {
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  const { address, baseUrl } = parseArgs(["score", ...rest]);
  if (!address) {
    console.error("Usage: vouch402 score <address>\n");
    process.exit(1);
  }

  const account = loadKeystoreAccount();
  console.log(`Paying from ${account.address}...`);

  const result = await getRiskScore(address, account, { baseUrl });

  console.log("");
  console.log(`Address:         ${result.address}`);
  console.log(`Score:           ${result.score}`);
  console.log(`Signals:         ${JSON.stringify(result.signals)}`);
  console.log(`Payment tx:      ${result.txHash}`);
  console.log(`Attestation UID: ${result.attestationUid}`);
  console.log(`Verified:        ${result.attestation ? "yes (resolved independently via EAS)" : "no"}`);
  console.log(`Explorer:        ${easExplorerUrl(result.network, result.attestationUid)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
