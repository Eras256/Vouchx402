# Decision Log

Running log of *why* things were built the way they were in this repo —
architecture decisions, deferred scope, environment divergences. This file
is a public asset: it shows judgment, not just output. Keep entries dated
and factual. This is NOT the strategy workspace's private memory — no budget
figures, no grant-program framing, no competitor-named comparisons here.

---

## 2026-08-12 — Project bootstrapped

Repo scaffolded from the Vouch402 technical spec. Stack: Express + viem +
EAS SDK on Base. See `docs/TECHNICAL_SPEC.md` for the full architecture.

## 2026-08-12 — Local storage: `node:sqlite`, not `better-sqlite3`

`better-sqlite3` requires a native build (`node-gyp`) and no prebuilt
binary was available for this Node version on Windows; the build failed
without Visual Studio's C++ build tools installed. Switched to Node's
built-in `node:sqlite` module (stable since Node 22.5, available in the
Node 20+ range this project targets on any machine running a current
enough Node) — zero native dependencies, same relational/SQL semantics,
sufficient for the processed-payment ledger and `/v1/metrics` counters.
Currently emits an "experimental" runtime warning; revisit if a future
Node LTS stabilizes the module without the warning.

## 2026-08-12 — Payment settlement: direct on-chain transfer, not EIP-3009 relay

The reference x402 "exact" scheme uses an EIP-3009 `transferWithAuthorization`
signature relayed through a facilitator service. Phase 1 instead has the
paying agent submit a standard on-chain USDC transfer itself and retry with
the transaction hash as proof (`scheme: "exact-direct"` in the 402 body).
This keeps the resource server self-contained (no dependency on an external
facilitator) while preserving the same external contract: unpaid request ->
402 -> pay -> retry with proof -> server-side verification before the
resource is released. Migrating to a facilitator-relayed signature scheme
later does not change that contract.

## 2026-08-12 — Wallet: single address used for both deployer and payTo

`X402_PAY_TO_ADDRESS` and `DEPLOYER_KEYSTORE_ACCOUNT` point at the same
generated Base Sepolia address. The Phase 1 integration test therefore pays
itself (a self-transfer) to prove the verification mechanism end-to-end;
real usage involves two distinct parties (a paying agent, and Vouch402's
receiving address). Revisit if/when a dedicated payer test identity is
needed.

## 2026-08-12 — Payment verification: unmined tx is a 402, not a 500

First real-funds test run surfaced a bug: `viem`'s `writeContract` resolves
as soon as a transaction is *submitted*, not once it's mined. The server's
`getTransactionReceipt` call was racing ahead of confirmation and throwing
`TransactionReceiptNotFoundError`, which fell through to a generic 500.
Fixed two ways: (1) `payment.ts` now catches that specific error and
reports it as a `PaymentVerificationError` (402, "not yet confirmed on-
chain; retry shortly") instead of a server fault; (2) the integration test
calls `waitForTransactionReceipt` before presenting proof, matching what a
real paying agent should do.

## Phase 1 gate — met (2026-08-12)

All three integration tests pass against live Base Sepolia state:
unpaid request -> 402, real settled USDC payment -> 200 with a real score,
and replay of the same proof -> rejected. Settlement tx:
https://sepolia.basescan.org/tx/0x4a9238c8ec1a9eef21dd14680a3e79a50c480f035f07dd221c37d2fa852095b4
(score=98 — correctly reads as high-risk for a wallet with no prior
history, consistent with the v0 heuristic in src/scoring/score.ts).

## Open questions

_(none currently blocking)_
