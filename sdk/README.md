# vouch402-sdk

TypeScript client for [Vouch402](https://vouch402.fly.dev): x402-metered
on-chain risk scores for Base addresses, with EAS fulfillment
attestations. Wraps the pay-then-fetch flow so a caller with a
viem-compatible signer doesn't have to hand-roll the 402 parsing,
payment, retry, and attestation-verification steps themselves.

## Install

```bash
npm install vouch402-sdk viem
```

`viem` is a peer dependency: bring your own version.

## Usage

```ts
import { getRiskScore } from "vouch402-sdk";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const result = await getRiskScore("0x53a79B109fa77c05B043e73A284a22b57c6263b0", account);

console.log(result.score, result.signals, result.attestationUid);
```

`getRiskScore` runs the full flow: quote, pay, fetch, and independently
verify the resulting attestation on EAS. It does not just trust the
API's own claim of what it attested.

### Step by step

```ts
import { getQuote, pay, fetchScore, verifyAttestation } from "vouch402-sdk";

const quote = await getQuote(address);           // parses the 402 body
const txHash = await pay(quote, account);         // on-chain USDC transfer
const result = await fetchScore(address, quote, txHash, account.address);
const attestation = await verifyAttestation(result.attestationUid, quote.network);
```

`pay` reads which network to pay on from the quote's own `network`
field, never from an assumption the caller could get out of sync with
the quote. `fetchScore` retries on a 402 specifically, since a
freshly-settled payment can briefly look unconfirmed to whichever
public RPC node the server's next read happens to land on.
`verifyAttestation` is a plain read against EAS: no signer or key
needed, since it's not submitting anything on-chain.

## API

- `getQuote(address, options?)`: GET the resource, parse the 402
  payment requirements.
- `pay(quote, signer)`: submit the on-chain USDC transfer for a quote.
  Returns the transaction hash.
- `fetchScore(address, quote, txHash, payer, options?)`: retry the
  resource request with proof of payment attached until it resolves.
- `verifyAttestation(attestationUid, network, options?)`: resolve a
  fulfillment attestation directly from EAS.
- `getRiskScore(address, signer, options?)`: the full flow in one call.

See [src/types.ts](src/types.ts) for the exact result and options shapes.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # integration test against a local server, Base Sepolia, real payments
```

`npm test` spins up a local instance of the main Vouch402 server (not
the live, mainnet-only production API) configured via the repo root's
`.env` with `NETWORK=base-sepolia`, and needs a funded testnet wallet.
See the root [README](../README.md#funding-the-testnet-wallet).

## License

MIT. See [LICENSE](../LICENSE).
