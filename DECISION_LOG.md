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

## 2026-08-12 — Phase 2: x402-SAP attestations, EAS on Base Sepolia

`X402ServiceFulfillment` and `X402ServiceDispute` registered on Base
Sepolia (non-revocable — see schema-string comments in
src/attestation/schemas.ts for why). EAS itself needed no deployment: it's
an OP Stack predeploy at `0x4200...0021` (SchemaRegistry at `...0020`),
same address on Base mainnet and Base Sepolia — verified against Base's
own contract-address docs and the eas-contracts deployment manifests for
both networks before writing any code against it, not assumed.

Reconciled one gap between this build prompt and docs/TECHNICAL_SPEC.md:
the prompt describes attesting "after a successful response is sent",
but the spec's API contract returns `attestationUid` *in* that response
body. Implemented as: compute the response payload, attest synchronously,
then send the response with the real UID attached — satisfies the
documented contract. `responseHash` covers only the substantive payload
(`address/score/signals`), not `attestationUid` itself, avoiding a
circular hash.

Fulfillment failures that happen *after* payment is verified (scoring or
attestation itself throwing) still get a best-effort `status=Error`
attestation before the 500 response — payment is already consumed at that
point and can't be un-charged; the dispute flow is the payer's recourse,
which is exactly why it exists.

## 2026-08-12 — Public RPC flakiness: root-caused, mitigated, not eliminated

First full-suite run against real funds surfaced `eas.getAttestation()`
returning a zeroed/not-found struct immediately after a confirmed attest
tx. Root-caused (not assumed) by querying the same UID directly via `cast
call` moments later and getting real data back — this is read-after-write
lag on `sepolia.base.org`, a shared, Cloudflare-fronted public RPC (the
build-on-base skill's own words: "rate-limited... not for production").
Two mitigations applied:
- `getAttestationWithRetry()` (src/lib/eas.ts) — retries a few times with
  backoff specifically when a read comes back as the EAS "not found"
  sentinel, since that's a successful-but-stale response, not a request
  error viem's own retry logic would catch.
- Widened viem's http transport retry budget for every RPC call
  (`retryCount: 6, retryDelay: 750ms, timeout: 20s` — see
  `httpTransport()` in src/lib/chain.ts) after directly observing a bare
  Cloudflare 502 from `sepolia.base.org` on a manual probe.

After both fixes: 6 of 8 back-to-back full-suite runs passed cleanly; the
remaining failures matched the same public-RPC-instability signature
(long duration from retry exhaustion). Not chasing this further with more
real transactions — the actual mechanism (payment verification,
attestation, dispute linking) has been independently confirmed correct
multiple times over via real, explorer-resolvable Base Sepolia state.
Production use should sit behind a dedicated RPC provider, per the
build-on-base skill's own guidance — that's an infra choice for Phase 3+
deployment, not a code fix.

## 2026-08-12 — Builder Code attribution: signer-level, not per-call

Registered Vouch402's deployer wallet for a Builder Code via the
build-on-base skill's `scripts/register.sh` (`bc_zt9va432`, stored in
`src/constants/builderCode.ts` per that skill's own convention — not a
secret, meant to be version-controlled). One correction to the skill's
own docs: the live API returns `builderCode` (camelCase) in its JSON
response, not `builder_code` as documented — confirmed by calling it
directly after `register.sh`'s parsing came back empty.

Vouch402's on-chain writes (schema registration, attestations) go through
the EAS SDK, which builds and sends its own transactions internally —
there's no per-call hook to append calldata after the fact. Instead of
reimplementing the SDK's request-building to attach the suffix per call,
`AttributedWallet` (src/lib/eas.ts) subclasses the ethers `Wallet` used as
the EAS signer and overrides `sendTransaction` to append the ERC-8021
suffix to every transaction that signer ever sends — satisfies "client
level, not per-call" from both the build-on-base skill's guidance and
docs/TECHNICAL_SPEC.md, without depending on EAS SDK internals.

## 2026-08-12 — Etherscan V1 API is deprecated; migrated to V2

While spot-checking a transaction's calldata, a live call to
`api-sepolia.basescan.org/api` returned `{"status":"0","message":"NOTOK",
"result":"...deprecated V1 endpoint..."}` — the scoring module
(src/scoring/score.ts) was built against that same deprecated per-chain
endpoint. Migrated `etherscanApiBaseFor()` to the unified V2 host
(`api.etherscan.io/v2/api`) with an explicit `chainid` param (Base's chain
ID doubles as the Etherscan V2 chainid — no separate mapping). Verified
the fix against the live endpoint (got "Invalid API Key" with a
placeholder key, not the deprecated-endpoint error).

**Still open**: no `ETHERSCAN_API_KEY` is configured yet, so
`fetchTxHistory()` short-circuits to `[]` and two of the four scoring
signals (`walletAgeDays`, `uniqueContractInteractions`) are always 0 —
not just for genuinely fresh wallets. Scores returned so far are real
computations, but running on a degraded signal set. Needs a free key from
etherscan.io (same account system as BaseScan, confirmed in
deploy-contracts.md) — I don't have browser access to get one myself.

## Open questions

- Need `ETHERSCAN_API_KEY` from the user (or explicit sign-off to keep
  running with 2 of 4 scoring signals structurally zeroed) before the
  scoring output is a genuine v0 model rather than a partially-degraded
  one. Not blocking Phase 3's gate (payment + attestation correctness
  don't depend on scoring accuracy), but should be resolved before this
  is presented as "live."
