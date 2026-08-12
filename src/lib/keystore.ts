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
 * The private key only ever lives in process memory — never logged, never
 * written to disk. Never commit the keystore password; it's read from
 * `DEPLOYER_KEYSTORE_PASSWORD` in the (gitignored) .env.
 */
export function loadDeployerAccount(): { privateKey: `0x${string}`; account: PrivateKeyAccount; address: `0x${string}` } {
  const accountName = env.requireEnv("DEPLOYER_KEYSTORE_ACCOUNT");
  const password = env.requireEnv("DEPLOYER_KEYSTORE_PASSWORD");

  const keystorePath = path.join(os.homedir(), ".foundry", "keystores", accountName);
  if (!fs.existsSync(keystorePath)) {
    throw new Error(
      `Keystore not found at ${keystorePath}. Run: cast wallet import ${accountName} --interactive (or cast wallet new).`
    );
  }

  const json = fs.readFileSync(keystorePath, "utf8");
  const wallet = EthersWallet.fromEncryptedJsonSync(json, password);
  const privateKey = wallet.privateKey as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  return { privateKey, account, address: account.address };
}
