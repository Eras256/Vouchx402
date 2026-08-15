# Vouch402

x402-metered on-chain risk intelligence for autonomous agents on Base,
with a built-in proof-of-fulfillment attestation layer (x402-SAP).

Live: **https://www.vouch402.xyz** (Docs, the Try It demo, and the live
activity feed) — direct API: **https://vouch402.fly.dev** (Base mainnet)

See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) for the full spec.
Also available as a Base MCP plugin (or will be, once the upstream
`base/skills` PR lands): see [`plugins/vouch402.md`](plugins/vouch402.md).

## Client packages

Three thin wrappers over this same API, all published on npm at `0.2.0`
(see `DECISION_LOG.md` for status):

- [`sdk/`](sdk): [`vouch402-sdk`](https://www.npmjs.com/package/vouch402-sdk),
  a TypeScript client library. `npm install vouch402-sdk`.
- [`cli/`](cli): [`vouch402`](https://www.npmjs.com/package/vouch402),
  `npx vouch402 score <address>` from a terminal.
- [`mcp-server/`](mcp-server):
  [`vouch402-mcp-server`](https://www.npmjs.com/package/vouch402-mcp-server),
  a standalone MCP server. Never holds a wallet; see its README for why.

## Live on Base mainnet

The full flow (quote, real payment, fulfillment, attestation) has run
end-to-end against real Base mainnet, not just testnet:

| | |
|---|---|
| Settled payment | [`0x6e44081aa3f05c73f6c9c32dc456f0231c3a690a33159765917ff096d138659c`](https://basescan.org/tx/0x6e44081aa3f05c73f6c9c32dc456f0231c3a690a33159765917ff096d138659c) |
| Fulfillment attestation tx (Builder-Code-attributed, verified byte-for-byte) | [`0xe2b5002c923bd9b49afce698f9d0f7ebef66d24f8c1eafd22c0a64e7c5f7ebb7`](https://basescan.org/tx/0xe2b5002c923bd9b49afce698f9d0f7ebef66d24f8c1eafd22c0a64e7c5f7ebb7) |
| `X402ServiceFulfillment` schema (mainnet) | [`0xfbd6000caf2aaa6f7e269c74b45a0f891ddfe3381356d8ebaefc46b1a524abac`](https://base.easscan.org/schema/view/0xfbd6000caf2aaa6f7e269c74b45a0f891ddfe3381356d8ebaefc46b1a524abac) |
| `X402ServiceDispute` schema (mainnet) | [`0x1920040cef7ce73e197d5a104e1c72e21d4787c8c095e9dba0584a8fee94fa18`](https://base.easscan.org/schema/view/0x1920040cef7ce73e197d5a104e1c72e21d4787c8c095e9dba0584a8fee94fa18) |
| USDC (Base mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Builder Code | `bc_zt9va432`, attributed at the signer level. See `src/lib/eas.ts` |

Full trace of every verification step (schemas checked with `getSchema()`
directly, the payment tx's own receipt, the attestation independently
resolved via EAS, the Builder Code suffix compared byte-for-byte against
the real transaction's calldata) is in `DECISION_LOG.md` under "Phase 3
gate: met".

## Ecosystem contributions

While auditing `eas-sdk` — the library this project calls directly for
every attestation it emits — found and reported
[eas-sdk#132](https://github.com/ethereum-attestation-service/eas-sdk/issues/132):
its receipt-parsing helpers (`getUIDsFromAttestReceipt` and friends)
match event logs by signature only, not by emitting contract, so a
schema's resolver can inject a forged UID into `multiAttest()`'s
result. Vouch402 itself isn't affected (no resolver, no `multiAttest()`
calls) — this is a library-level finding reported upstream, not a gap
in this project.

Separately, and of a different, lower-stakes kind — a docs/UX bug, not
a security finding: while working with `foundry-rs/foundry`'s `cast`
(the keystore tooling `src/lib/keystore.ts` and `cli/src/keystore.ts`
both decrypt), found that `cast wallet new <name>` fails with a bare
account name, unlike `cast wallet import <name>`, which saves to the
default keystore directory the same way. The tracking issue for this
exact inconsistency, foundry-rs/foundry#11147, had already been closed
as "completed" against a fix that only covers a different case. Filed
[foundry-rs/foundry#16209](https://github.com/foundry-rs/foundry/issues/16209)
with the repro and the diff-level explanation of the gap. Concretely
real for this project too, not just upstream: `cli/README.md` documented
the broken command form and had to be fixed to the working one.

## How it works

```
GET /v1/risk-score/:address          -> 402 + x402 payment requirements
  pay the quoted USDC amount on-chain
GET /v1/risk-score/:address           -> 200 + score, signals, attestationUid
  (retry, with X-PAYMENT: base64({resourceId, txHash, payer}))
```

Every successful (or failed-after-payment) fulfillment is recorded as an
`X402ServiceFulfillment` attestation on EAS: independently resolvable by
anyone, without trusting Vouch402's own word for what it returned. See
[x402-SAP](docs/TECHNICAL_SPEC.md#x402-sap-attestation-schemas-eas-deployed-on-base).

## Try it

```bash
# 1. Unpaid request -> 402 with payment requirements
curl https://vouch402.fly.dev/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0

# 2. Pay the quoted USDC amount on-chain to `payTo` (any standard ERC-20
#    transfer works; see docs/TECHNICAL_SPEC.md for why this isn't the
#    EIP-3009/facilitator "exact" scheme). Then retry with proof:
curl https://vouch402.fly.dev/v1/risk-score/0x53a79B109fa77c05B043e73A284a22b57c6263b0 \
  -H "X-PAYMENT: $(echo -n '{"resourceId":"0x...","txHash":"0x...","payer":"0x..."}' | base64)"

# Public, unpaid:
curl https://vouch402.fly.dev/v1/metrics
```

`scripts/demo.ts` runs this whole flow end-to-end against whichever
network is configured in `.env`, using a funded local wallet. See
[Local development](#local-development).

## Architecture

- `src/server/` is the Express app: x402 quote issuance, server-side
  payment verification (replay protection, on-chain receipt check),
  `/v1/metrics`, `/v1/disputes`.
- `src/scoring/` is the v0 risk heuristic (wallet age, tx count,
  contract-interaction diversity, flag-list membership). Explicitly not
  a complete risk model: see `docs/TECHNICAL_SPEC.md`.
- `src/attestation/` is x402-SAP: EAS schema registration, fulfillment
  attestations, dispute filing (disputant identity recovered from an
  EIP-191 signature, never a claimed field).
- `src/lib/` is shared: env/config, viem chain clients (with retry
  hardening for the public Base RPC's observed flakiness; see
  `DECISION_LOG.md`), SQLite persistence (`node:sqlite`, no native
  build step), the EAS/ethers signer (Builder-Code-attributed at the
  client level), Foundry-keystore decryption.
- [`web/`](web): the Next.js frontend deployed at
  https://www.vouch402.xyz (Docs page, the live Try It demo, the
  activity feed) — a pure client of the API above, no server-side
  logic of its own.

## Local development

```bash
npm install
cp .env.example .env   # fill in DEPLOYER_KEYSTORE_ACCOUNT / _PASSWORD, X402_PAY_TO_ADDRESS
npm test                # Base Sepolia integration tests (real on-chain txs)
npm run dev              # server on $PORT (default 3402)
npm run build             # production build -> dist/
npm run demo               # scripts/demo.ts: full flow, prints each step + hash/UID
```

### Funding the testnet wallet

The `DEPLOYER_KEYSTORE_ACCOUNT` / `X402_PAY_TO_ADDRESS` wallet needs Base
Sepolia ETH (gas) and USDC before `npm test` can exercise a real payment:

1. Get the address: `cast wallet address --account <DEPLOYER_KEYSTORE_ACCOUNT from .env>`
2. Claim ETH: [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet) -> Base Sepolia -> ETH
3. Claim USDC: [Circle Faucet](https://faucet.circle.com/) -> Base Sepolia -> USDC
4. Verify: `cast balance <address> --rpc-url https://sepolia.base.org`

## Deployment

Deployed on Fly.io (`fly.toml`, `Dockerfile`), `NETWORK=base` in
production. The deployer keystore is never baked into the image.
`DEPLOYER_KEYSTORE_JSON` (the encrypted keystore file's contents) and
`DEPLOYER_KEYSTORE_PASSWORD` are Fly secrets, decrypted only in memory at
process start (`src/lib/keystore.ts`). `X402_PAY_TO_ADDRESS_MAINNET` is
a separate address from the deployer/signer wallet on purpose. See
`DECISION_LOG.md`, "Split payTo (treasury) from the signer wallet".

```bash
fly deploy --app vouch402
```

## License

MIT. See [LICENSE](LICENSE).
