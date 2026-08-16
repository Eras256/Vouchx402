#!/usr/bin/env node
import { getRiskScore, easExplorerUrl } from "vouch402-sdk";
import { loadKeystoreAccount } from "./keystore.js";

function printHelp(): void {
  console.log(`vouch402: evaluate an address's Vouch402 risk score

Usage:
  vouch402 score <address> --attest-jurisdiction [--base-url <url>] [--public]

Pays for and fetches a live risk score for a Base address, then
independently verifies the resulting attestation on EAS.

  --attest-jurisdiction   Required. Certifies that you are not located
             in, and are not paying on behalf of anyone in, Cuba, Iran,
             North Korea, Syria, the Russian-occupied regions of
             Ukraine, or mainland China. The API rejects the request
             outright without this: see the "Restricted Jurisdictions"
             section at https://www.vouch402.xyz/legal for the legal
             basis. This is the CLI's equivalent of the checkbox on the
             website's own "Try It" demo; there is no interactive
             prompt here on purpose, since this command is also run
             non-interactively/by scripts.

  --public   Make this result visible on Vouch402's public activity
             feed (address, score, and signals). Off by default:
             the result stays attestation-only, same as before this
             flag existed.

Requires a funded wallet, loaded from a Foundry keystore (never a raw
private key):
  VOUCH402_KEYSTORE_ACCOUNT    keystore name under ~/.foundry/keystores
  VOUCH402_KEYSTORE_PASSWORD   keystore password
  VOUCH402_KEYSTORE_JSON       (alternative) keystore file contents, inline
`);
}

function parseArgs(argv: string[]): {
  address?: string;
  baseUrl?: string;
  makePublic: boolean;
  jurisdictionAttestation: boolean;
} {
  const [, address] = argv;
  let baseUrl: string | undefined;
  const flagIndex = argv.indexOf("--base-url");
  if (flagIndex !== -1) baseUrl = argv[flagIndex + 1];
  const makePublic = argv.includes("--public");
  const jurisdictionAttestation = argv.includes("--attest-jurisdiction");
  return { address, baseUrl, makePublic, jurisdictionAttestation };
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

  const { address, baseUrl, makePublic, jurisdictionAttestation } = parseArgs(["score", ...rest]);
  if (!address) {
    console.error("Usage: vouch402 score <address> --attest-jurisdiction\n");
    process.exit(1);
  }
  if (!jurisdictionAttestation) {
    console.error(
      "Missing required --attest-jurisdiction flag. Run with --help for what it certifies and why it's required; the API rejects the request outright without it.\n"
    );
    process.exit(1);
  }

  const account = loadKeystoreAccount();
  console.log(`Paying from ${account.address}...`);

  const result = await getRiskScore(address, account, { baseUrl, makePublic, jurisdictionAttestation });

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
