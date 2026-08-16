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
const result = await fetchScore(address, quote, txHash, account.address, {
  jurisdictionAttestation: true,                  // required, see below
});
const attestation = await verifyAttestation(result.attestationUid, quote.network);
```

`pay` reads which network to pay on from the quote's own `network`
field, never from an assumption the caller could get out of sync with
the quote. `fetchScore` retries on a 402 specifically, since a
freshly-settled payment can briefly look unconfirmed to whichever
public RPC node the server's next read happens to land on.
`verifyAttestation` is a plain read against EAS: no signer or key
needed, since it's not submitting anything on-chain.

### Jurisdiction attestation (required)

`fetchScore` and `getRiskScore` both require a `jurisdictionAttestation:
true` option; the API rejects the request outright (`403`) without it.
It certifies that the caller (and whoever it's acting for) is not
located in, and is not paying on behalf of anyone in, Cuba, Iran, North
Korea, Syria, the Russian-occupied regions of Ukraine, or mainland
China. See the "Restricted Jurisdictions" section at
[vouch402.xyz/legal](https://www.vouch402.xyz/legal) for the legal
basis behind each entry.

This exists specifically because most callers of this SDK are
autonomous agents, not a human clicking a checkbox in a browser (the
website's own "Try It" demo has that checkbox; this option is its
equivalent for code). Whatever is calling this SDK is responsible for
deciding this honestly, not defaulting it to `true` reflexively: the
strict-boolean handling matches `makePublic` below, only the literal
`true` counts.

### Making a result public

By default, a scored result is attestation-only on Vouch402's public
activity feed: no address, score, or signals are shown, only that a
fulfillment happened. Pass `makePublic: true` to opt this specific
result into being shown in full:

```ts
const result = await getRiskScore(address, account, {
  makePublic: true,
  jurisdictionAttestation: true,
});
```

Works the same on `fetchScore` directly. Off unless you ask for it,
same before and after this option existed.

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
