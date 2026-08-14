import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Wallet as EthersWallet } from "ethers";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { env } from "./env";

/**
 * Decrypts a Foundry-created keystore (`cast wallet import` / `cast wallet
 * new`) and returns a raw private key plus a ready-to-use viem account.
 *
 * Two sources for the encrypted keystore JSON, checked in order:
 *  1. `DEPLOYER_KEYSTORE_JSON`: the keystore file's contents inline, as a
 *     Fly secret. Lets a deployed instance run without ever baking the
 *     keystore file (or the raw private key) into a Docker image layer;
 *     it's still encrypted ciphertext, useless without the password
 *     secret alongside it.
 *  2. `~/.foundry/keystores/<DEPLOYER_KEYSTORE_ACCOUNT>`: local dev, the
 *     file `cast wallet new/import` writes directly.
 *
 * Either way, the private key only ever lives in process memory, never
 * logged, never written to disk. Never commit the password or the inline
 * JSON; both come from environment (gitignored `.env` locally, Fly
 * secrets in production).
 */
export function loadDeployerAccount(): { privateKey: `0x${string}`; account: PrivateKeyAccount; address: `0x${string}` } {
  const password = env.requireEnv("DEPLOYER_KEYSTORE_PASSWORD");

  let json: string;
  if (process.env.DEPLOYER_KEYSTORE_JSON) {
    json = process.env.DEPLOYER_KEYSTORE_JSON;
  } else {
    const accountName = env.requireEnv("DEPLOYER_KEYSTORE_ACCOUNT");
    const keystorePath = path.join(os.homedir(), ".foundry", "keystores", accountName);
    if (!fs.existsSync(keystorePath)) {
      throw new Error(
        `Keystore not found at ${keystorePath}. Run: cast wallet import ${accountName} --interactive (or cast wallet new). ` +
          `In production, set DEPLOYER_KEYSTORE_JSON instead of relying on a local keystore file.`
      );
    }
    json = fs.readFileSync(keystorePath, "utf8");
  }

  const wallet = EthersWallet.fromEncryptedJsonSync(json, password);
  const privateKey = wallet.privateKey as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  return { privateKey, account, address: account.address };
}
