import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Wallet as EthersWallet } from "ethers";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/**
 * Decrypts a Foundry-created keystore (`cast wallet import` / `cast wallet
 * new`) into a viem account. Mirrors the same pattern the Vouch402 server
 * itself uses for its own signer (src/lib/keystore.ts in the main repo):
 * no raw private key ever accepted via an env var.
 *
 * Two sources for the encrypted keystore JSON, checked in order:
 *  1. `VOUCH402_KEYSTORE_JSON`: the keystore file's contents inline.
 *  2. `~/.foundry/keystores/<VOUCH402_KEYSTORE_ACCOUNT>`: the file
 *     `cast wallet new`/`import` writes directly.
 */
export function loadKeystoreAccount(): PrivateKeyAccount {
  const password = process.env.VOUCH402_KEYSTORE_PASSWORD;
  if (!password) {
    throw new Error("VOUCH402_KEYSTORE_PASSWORD is not set. Required to decrypt your wallet's keystore.");
  }

  let json: string;
  if (process.env.VOUCH402_KEYSTORE_JSON) {
    json = process.env.VOUCH402_KEYSTORE_JSON;
  } else {
    const accountName = process.env.VOUCH402_KEYSTORE_ACCOUNT;
    if (!accountName) {
      throw new Error(
        "Set VOUCH402_KEYSTORE_ACCOUNT (a `cast wallet` account name) or VOUCH402_KEYSTORE_JSON (inline keystore contents)."
      );
    }
    const keystorePath = path.join(os.homedir(), ".foundry", "keystores", accountName);
    if (!fs.existsSync(keystorePath)) {
      throw new Error(
        `Keystore not found at ${keystorePath}. Run: cast wallet import ${accountName} --interactive (or cast wallet new).`
      );
    }
    json = fs.readFileSync(keystorePath, "utf8");
  }

  const wallet = EthersWallet.fromEncryptedJsonSync(json, password);
  return privateKeyToAccount(wallet.privateKey as `0x${string}`);
}
