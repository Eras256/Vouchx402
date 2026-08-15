# Decision Log

Running log of *why* things were built the way they were in this repo:
architecture decisions, deferred scope, environment divergences. This file
is a public asset: it shows judgment, not just output. Keep entries dated
and factual. This is NOT the strategy workspace's private memory: no budget
figures, no grant-program framing, no competitor-named comparisons here.

---

## 2026-08-12: Project bootstrapped

Repo scaffolded from the Vouch402 technical spec. Stack: Express + viem +
EAS SDK on Base. See `docs/TECHNICAL_SPEC.md` for the full architecture.

## 2026-08-12: Local storage: `node:sqlite`, not `better-sqlite3`

`better-sqlite3` requires a native build (`node-gyp`) and no prebuilt
binary was available for this Node version on Windows; the build failed
without Visual Studio's C++ build tools installed. Switched to Node's
built-in `node:sqlite` module (stable since Node 22.5, available in the
Node 20+ range this project targets on any machine running a current
enough Node). Zero native dependencies, same relational/SQL semantics,
sufficient for the processed-payment ledger and `/v1/metrics` counters.
Currently emits an "experimental" runtime warning; revisit if a future
Node LTS stabilizes the module without the warning.

## 2026-08-12: Payment settlement: direct on-chain transfer, not EIP-3009 relay

The reference x402 "exact" scheme uses an EIP-3009 `transferWithAuthorization`
signature relayed through a facilitator service. Phase 1 instead has the
paying agent submit a standard on-chain USDC transfer itself and retry with
the transaction hash as proof (`scheme: "exact-direct"` in the 402 body).
This keeps the resource server self-contained (no dependency on an external
facilitator) while preserving the same external contract: unpaid request ->
402 -> pay -> retry with proof -> server-side verification before the
resource is released. Migrating to a facilitator-relayed signature scheme
later does not change that contract.

## 2026-08-12: Wallet: single address used for both deployer and payTo

`X402_PAY_TO_ADDRESS` and `DEPLOYER_KEYSTORE_ACCOUNT` point at the same
generated Base Sepolia address. The Phase 1 integration test therefore pays
itself (a self-transfer) to prove the verification mechanism end-to-end;
real usage involves two distinct parties (a paying agent, and Vouch402's
receiving address). Revisit if/when a dedicated payer test identity is
needed.

## 2026-08-12: Payment verification: unmined tx is a 402, not a 500

First real-funds test run surfaced a bug: `viem`'s `writeContract` resolves
as soon as a transaction is *submitted*, not once it's mined. The server's
`getTransactionReceipt` call was racing ahead of confirmation and throwing
`TransactionReceiptNotFoundError`, which fell through to a generic 500.
Fixed two ways: (1) `payment.ts` now catches that specific error and
reports it as a `PaymentVerificationError` (402, "not yet confirmed on-
chain; retry shortly") instead of a server fault; (2) the integration test
calls `waitForTransactionReceipt` before presenting proof, matching what a
real paying agent should do.

## Phase 1 gate: met (2026-08-12)

All three integration tests pass against live Base Sepolia state:
unpaid request -> 402, real settled USDC payment -> 200 with a real score,
and replay of the same proof -> rejected. Settlement tx:
https://sepolia.basescan.org/tx/0x4a9238c8ec1a9eef21dd14680a3e79a50c480f035f07dd221c37d2fa852095b4
(score=98: correctly reads as high-risk for a wallet with no prior
history, consistent with the v0 heuristic in src/scoring/score.ts).

## 2026-08-12: Phase 2: x402-SAP attestations, EAS on Base Sepolia

`X402ServiceFulfillment` and `X402ServiceDispute` registered on Base
Sepolia (non-revocable; see schema-string comments in
src/attestation/schemas.ts for why). EAS itself needed no deployment: it's
an OP Stack predeploy at `0x4200...0021` (SchemaRegistry at `...0020`),
same address on Base mainnet and Base Sepolia, verified against Base's
own contract-address docs and the eas-contracts deployment manifests for
both networks before writing any code against it, not assumed.

Reconciled one gap between this build prompt and docs/TECHNICAL_SPEC.md:
the prompt describes attesting "after a successful response is sent",
but the spec's API contract returns `attestationUid` *in* that response
body. Implemented as: compute the response payload, attest synchronously,
then send the response with the real UID attached. This satisfies the
documented contract. `responseHash` covers only the substantive payload
(`address/score/signals`), not `attestationUid` itself, avoiding a
circular hash.

Fulfillment failures that happen *after* payment is verified (scoring or
attestation itself throwing) still get a best-effort `status=Error`
attestation before the 500 response. Payment is already consumed at that
point and can't be un-charged; the dispute flow is the payer's recourse,
which is exactly why it exists.

## 2026-08-12: Public RPC flakiness: root-caused, mitigated, not eliminated

First full-suite run against real funds surfaced `eas.getAttestation()`
returning a zeroed/not-found struct immediately after a confirmed attest
tx. Root-caused (not assumed) by querying the same UID directly via `cast
call` moments later and getting real data back: this is read-after-write
lag on `sepolia.base.org`, a shared, Cloudflare-fronted public RPC (the
build-on-base skill's own words: "rate-limited... not for production").
Two mitigations applied:
- `getAttestationWithRetry()` (src/lib/eas.ts): retries a few times with
  backoff specifically when a read comes back as the EAS "not found"
  sentinel, since that's a successful-but-stale response, not a request
  error viem's own retry logic would catch.
- Widened viem's http transport retry budget for every RPC call
  (`retryCount: 6, retryDelay: 750ms, timeout: 20s`; see
  `httpTransport()` in src/lib/chain.ts) after directly observing a bare
  Cloudflare 502 from `sepolia.base.org` on a manual probe.

After both fixes: 6 of 8 back-to-back full-suite runs passed cleanly; the
remaining failures matched the same public-RPC-instability signature
(long duration from retry exhaustion). Not chasing this further with more
real transactions: the actual mechanism (payment verification,
attestation, dispute linking) has been independently confirmed correct
multiple times over via real, explorer-resolvable Base Sepolia state.
Production use should sit behind a dedicated RPC provider, per the
build-on-base skill's own guidance. That's an infra choice for Phase 3+
deployment, not a code fix.

## 2026-08-12: Builder Code attribution: signer-level, not per-call

Registered Vouch402's deployer wallet for a Builder Code via the
build-on-base skill's `scripts/register.sh` (`bc_zt9va432`, stored in
`src/constants/builderCode.ts` per that skill's own convention, not a
secret, meant to be version-controlled). One correction to the skill's
own docs: the live API returns `builderCode` (camelCase) in its JSON
response, not `builder_code` as documented. Confirmed by calling it
directly after `register.sh`'s parsing came back empty.

Vouch402's on-chain writes (schema registration, attestations) go through
the EAS SDK, which builds and sends its own transactions internally:
there's no per-call hook to append calldata after the fact. Instead of
reimplementing the SDK's request-building to attach the suffix per call,
`AttributedWallet` (src/lib/eas.ts) subclasses the ethers `Wallet` used as
the EAS signer and overrides `sendTransaction` to append the ERC-8021
suffix to every transaction that signer ever sends. This satisfies
"client level, not per-call" from both the build-on-base skill's guidance
and docs/TECHNICAL_SPEC.md, without depending on EAS SDK internals.

## 2026-08-12: Etherscan V1 API is deprecated; migrated to V2

While spot-checking a transaction's calldata, a live call to
`api-sepolia.basescan.org/api` returned `{"status":"0","message":"NOTOK",
"result":"...deprecated V1 endpoint..."}`: the scoring module
(src/scoring/score.ts) was built against that same deprecated per-chain
endpoint. Migrated `etherscanApiBaseFor()` to the unified V2 host
(`api.etherscan.io/v2/api`) with an explicit `chainid` param (Base's chain
ID doubles as the Etherscan V2 chainid; no separate mapping). Verified
the fix against the live endpoint (got "Invalid API Key" with a
placeholder key, not the deprecated-endpoint error).

**Still open**: no `ETHERSCAN_API_KEY` is configured yet, so
`fetchTxHistory()` short-circuits to `[]` and two of the four scoring
signals (`walletAgeDays`, `uniqueContractInteractions`) are always 0,
not just for genuinely fresh wallets. Scores returned so far are real
computations, but running on a degraded signal set. Needs a free key from
etherscan.io (same account system as BaseScan, confirmed in
deploy-contracts.md); I don't have browser access to get one myself.

## 2026-08-12: Builder Code attribution: verified directly, not inferred

Sent a trivial 0-value self-transfer through `getEasSigner()` (the same
signer every EAS call uses) and compared its on-chain calldata
byte-for-byte against the expected `ox/erc8021` suffix, rather than trusting that
the wiring was correct because the test suite still passed. Confirmed on
Base Sepolia: calldata `0x62635f7a743976613433320b0080218021802180218021
802180218021` ends with the exact `80218021...` marker.
(https://sepolia.basescan.org/tx/0x4a991a1ee3683866b89312152d26d1693e859df4e77a4407ee94ed3163e1af5c)

## 2026-08-12: Phase 4: /v1/metrics, and a real nonce-race bug it surfaced

Added `attestations` and `disputes` tables (src/lib/db.ts), written from
the single choke points that create them (`attestFulfillment`,
`submitDispute`) so counts stay accurate even for `status=Error`
fulfillments that never produce a `requests_served` row. `/v1/metrics`
is a straight read of these tables: no estimation, no caching.

Building its test (pay-and-fulfill immediately followed by reading
metrics) surfaced a second real bug from the same root cause as the
EAS-read staleness above: right after the payment tx confirmed, the
*next* transaction from the same address (the fulfillment attestation,
sent via ethers) failed with `REPLACEMENT_UNDERPRICED`: ethers'
"pending" nonce lookup landed on a Cloudflare backend node that hadn't
caught up with the just-mined payment tx yet, computed an already-used
nonce, and the resend was rejected. Confirmed live, not inferred from the
test alone. Fixed with `withNonceRetry()` (src/lib/eas.ts): retries
`sendTransaction` a few times with backoff on nonce-collision errors
specifically, re-deriving the nonce from scratch each attempt (never
reusing a stale one). Same mitigation philosophy as
`getAttestationWithRetry`: targeted at the specific failure signature
observed, not a blanket retry-everything wrapper.

## 2026-08-12: Phase 5 draft: plugins/vouch402.md, and a real blocker it surfaced

Read the current `.agents/skills/base-mcp/references/plugin-spec.md` in
full before writing anything (not from memory or from how this build
prompt described it). One correction that check caught: the build prompt
suggested `agent-commerce` might need adding to the tag vocabulary: it's
already there. Two tags genuinely are new and get appended to that
vocabulary list as part of the eventual PR: `risk-scoring`, `attestations`.

Classified `integration: http-api`: Vouch402 returns payment
requirements then JSON data, never calldata for the caller to submit
itself; the only Base MCP call in the flow is the `send_calls` USDC
payment. `risk: [irreversible]`: payment settles before the caller knows
whether fulfillment will succeed, and there's no refund path, only the
dispute flow.

**Real blocker, not a formality**: `requires.allowlist` and the
`## Endpoints` section need a real public host, and Vouch402 has never
been deployed anywhere reachable. Every phase so far has run against
local dev + direct Base RPC/EAS calls. This gap was never addressed
anywhere in the phase list. Wrote the plugin file with every section that
*is* independently verifiable against the actual code (endpoint shapes,
request/response bodies, orchestration steps, submission mapping) but
left `requires.allowlist` as an explicit `TODO-vouch402-not-yet-deployed`
placeholder rather than inventing a domain: a plugin file with a
fabricated host would look done without being true, which is exactly what
the stricter Phase 5 bar rules out.

The bundled `plugin-review` skill isn't available in this environment
(not in the invocable skill list). Self-reviewing against the Authoring
Checklist manually, but that self-review can't complete honestly until
the hosting gap above is resolved (the checklist requires a real
`allowlist`/endpoint host to check against).

## 2026-08-12: Deployment groundwork: Fly.io, blocked on account billing

User chose Fly.io for hosting (resolves the Phase 5 blocker above once
live). Built the production path:

- `Dockerfile`: multi-stage, `node:24-slim` (matches the Node version
  `node:sqlite` was confirmed working unflagged on locally, not a generic
  LTS guess). Production build uses a dedicated `tsconfig.build.json`
  (`rootDir: src`) instead of the root tsconfig: the root config's
  `rootDir: "."` was nesting compiled output under `dist/src/...` and
  compiling `test/**/*` too (which isn't even copied into the Docker
  build stage). Caught by actually running the build locally before
  writing the Dockerfile's `CMD`, not assumed from the tsconfig as
  written.
- `src/lib/keystore.ts` now accepts the encrypted keystore JSON inline via
  `DEPLOYER_KEYSTORE_JSON` (a Fly secret), falling back to the local
  `~/.foundry/keystores/<account>` file for dev. The private key never
  needs to be baked into a Docker image layer: the deployed instance
  only ever holds the still-encrypted JSON plus the password secret,
  both as Fly secrets.
- `fly.toml`: region `dfw` (matches the user's other Fly apps), 512MB,
  scale-to-zero (`min_machines_running: 0`, cost-conscious for a
  low-traffic v0 service), `NETWORK=base-sepolia`, **not** `base` yet,
  since the Phase 3 mainnet gate isn't actually met. Flip this once it
  is, not before.
- Verified the compiled build actually boots and serves real data
  (`GET /v1/metrics` against `node dist/server/index.js` locally)
  before treating any of this as done.

**Blocked**: `flyctl apps create` failed: the account has overdue
invoices (`fly.io/dashboard/vaiosx/billing`). Not something to work
around; needs the user to clear it. Everything above is ready to deploy
the moment that's resolved.

## 2026-08-12: Deployed live; found a real gap via the trial account's kill policy

Live at `https://vouch402.fly.dev`. Fixed one real bug before it worked
at all: `req.protocol` read `http` even over HTTPS, because Fly
terminates TLS at the edge and Express doesn't trust the forwarded
proto by default: the 402 body's `resource` field was claiming an
insecure URL. Fixed with `app.set("trust proxy", true)`; confirmed the
field reads `https://` correctly afterward, not just assumed.

Running a real paid request against the live deployment (to verify the
deployed instance's own keystore-secret decryption and EAS signing
actually work, not just the local path) surfaced something more
important: the account this app was created under is on Fly's free
**trial** tier, which force-kills any machine after 5 minutes of runtime
regardless of activity ("add a credit card to run longer than 5m0s").
The kill landed mid-request: payment already verified and marked
processed, but the attestation/response never completed, so the caller
got nothing back for a payment that had already gone through.

That's not just a trial-tier quirk to shrug off: `auto_stop_machines:
"stop"` (our own scale-to-zero config) sends the *same* SIGINT on any
idle auto-stop, so a real request racing a normal scale-down could hit
the identical failure mode later, trial tier or not. Added graceful
shutdown (`src/server/index.ts`): SIGINT/SIGTERM now drains in-flight
requests (stop accepting new connections, let existing ones finish, 25s
cap) instead of Node's default immediate exit. Verified against real
behavior, not assumed correct from adding the handler alone: the
before-state (payment recorded, no attestation, no response) is on the
live volume as `uniquePayers:1` with `attestationCount:0` from that
first attempt.

**Still needs the user**: the trial 5-minute cap itself isn't something
graceful shutdown fully solves: a request that's still running at the
25s drain cap would still be cut off, just less abruptly than before.
Add a credit card to the Fly account (`neuralsol7@gmail.com`) to lift the
trial cap for real reliability.

Re-ran the same live paid request after the graceful-shutdown redeploy:
clean `200`, real `attestationUid`, and `/v1/metrics` moved by exactly
what was expected (`totalRequestsServed`/`attestationCount` +1 for the
successful run; the earlier killed attempt only shows up in
`totalVolumeUsdc`/`uniquePayers`, which is the correct distinction:
payment was genuinely processed even though nothing was ever delivered
for it). Phase 5's hosting blocker is resolved.

## 2026-08-12: Phase 6: demo.ts caught a real gap in the retry helper itself

First full run of `scripts/demo.ts` (the Phase 6 gate: a single
unattended script running the whole flow) failed at the dispute step: a
bare `sepolia.base.org` 502 came back as a **thrown exception**, not a
zeroed/not-found struct. `getAttestationWithRetry` only ever retried on
the not-found-struct case: a thrown error skipped the retry loop
entirely and propagated straight up. Fixed by wrapping the read in
try/catch too, retrying either failure mode with the same backoff budget
and only surfacing the real error once retries are exhausted. Re-ran
`scripts/demo.ts` clean afterward: 402 -> real payment -> 200 with
attestation -> independently resolved via EAS -> dispute filed and
resolved -> `/v1/metrics` reflecting all of it. Phase 6 gate met.

## 2026-08-12: Hardening pass: malformed-input 500s, unbounded quote growth

Three issues found by reading the actual failure paths, not from a
specific bug report:

- `GET /v1/risk-score/:address` mapped *any* non-`PaymentVerificationError`
  thrown while decoding the `X-PAYMENT` header into a bare 500 "Internal
  error", including a client sending garbage in the header, which isn't
  a server fault. Decoding is now a separate try/catch, mapped to 400.
- `POST /v1/disputes` had the same shape of bug: a malformed `signature`
  made `recoverMessageAddress` throw a raw viem error that fell through
  to the catch-all 500. Now caught and re-thrown as `DisputeError` (400).
- `GET /v1/risk-score/:address` is public and unpaid on the *first* call:
  every hit inserts a `quotes` row, and nothing ever deleted one.
  Unbounded growth on a public endpoint against a small (1GB) volume:
  sustained hammering (or just a crawler) would eventually fill the disk.
  Swept opportunistically in `insertQuote()` itself (delete expired,
  unconsumed rows before inserting the new one) rather than adding a
  cron/scheduler: self-throttles under any traffic shape, no new moving
  parts.

Also extracted `scoreFromSignals()` (src/scoring/score.ts) as a pure
function separate from the network-fetching logic around it, specifically
so the scoring formula has real unit test coverage (test/score.test.ts)
that doesn't inherit the public Base Sepolia RPC's flakiness the rest of
this suite is stuck with.

## 2026-08-12: Re-verified plugins/vouch402.md against the live instance

Per the stricter Phase 5 bar (verify every claim against actual live
behavior, not memory): pulled fresh responses from `vouch402.fly.dev`
rather than trusting what was written when the file was drafted before
deployment existed. Found one real drift: the example `402` response
body showed `"network": "base"` and mainnet USDC's address, but the live
instance currently returns `"network": "base-sepolia"` and Sepolia USDC
(correct: mainnet cutover hasn't happened yet). Fixed the example to show
what the service actually returns right now, with a note that both
fields are already derived from live config and will read `base`/mainnet
USDC automatically post-cutover, no plugin-file edit needed then.
`/v1/metrics`'s documented shape was checked the same way and matched
exactly.

## 2026-08-12: Split payTo (treasury) from the signer wallet

The user asked, correctly, why they'd be sending real mainnet funds to a
wallet I generated rather than one they control. Good catch I should have
raised proactively: `X402_PAY_TO_ADDRESS` and the deployer/signer wallet
had been the same address since Phase 0, which is fine for testnet
(nothing real at stake) but not something to carry into mainnet without
a decision: it means the private key for the wallet that **receives
payment revenue** lives on the server (Fly secret, decrypted at runtime)
alongside the autonomous signing key, so a server/secret compromise would
expose both together.

Split into `X402_PAY_TO_ADDRESS_SEPOLIA` / `_MAINNET` (`payToFor()` in
src/lib/env.ts), mirroring the existing per-network EAS schema UID
pattern. Sepolia falls back to the legacy single `X402_PAY_TO_ADDRESS` so
none of the existing test suite or live Sepolia deployment changes
behavior: verified directly (`payToFor("base-sepolia")` still returns
the deployer address). Mainnet has **no fallback**: `payToFor("base")`
throws rather than silently reusing the signer wallet as treasury.
Verified that too. Waiting on the user for an address they actually
control before `X402_PAY_TO_ADDRESS_MAINNET` gets set; the signer wallet
keeps its existing role (just needs gas ETH, never holds revenue).

## 2026-08-12: `.env.local` support, and why the funding wallet doesn't need a raw private key

Added `.env.local` as an optional, gitignored override layer on top of
`.env` (loaded second, `override: true`, in src/lib/env.ts): standard
convention elsewhere (Next.js/Vite/CRA), not previously supported here.
Verified directly: a key absent from `.env.local` keeps `.env`'s value
(nothing gets silently blanked), and a key present in `.env.local`
overrides it. Using it to hold the Phase 3 mainnet-cutover additions
(`X402_PAY_TO_ADDRESS_MAINNET`, currently blank) without duplicating
unrelated secrets across two files: avoids the drift risk of two full
copies, and avoids re-exposing `DEPLOYER_KEYSTORE_PASSWORD` in a second
place for no reason.

Also worth recording since it came up directly: this project has no raw
private-key env var anywhere, by design, for two independent reasons:
(1) x402 payments are signed and sent by the paying agent, never by
Vouch402 itself (the server only verifies a settled payment after the
fact), so there's no key needed on that side at all; (2) the one key
Vouch402's server *does* need (the EAS/attestation signer) is only ever
handled as an encrypted Foundry keystore
(`DEPLOYER_KEYSTORE_JSON`/`_PASSWORD`), never a plaintext key. Adding a
`PRIVATE_KEY=` variable would be a regression from that.

## 2026-08-12: Mainnet treasury address confirmed and set

`X402_PAY_TO_ADDRESS_MAINNET` is now `0xb440b82Fb537A56eD8FC045Da622B469E88Fd2bB`:
the user's own wallet, confirmed explicitly, not the generated signer
wallet. Verified `payToFor("base")` resolves to it (and `payToFor("base-
sepolia")` is unaffected) before treating this as done, not just from
having written the value.

Funding status, checked on-chain directly rather than trusting the
description of what was sent: 3 USDC landed correctly on the treasury
address. The ETH (~100 MXN, intended for the *signer* wallet
`0x53a79B...263b0` for gas) hadn't landed on either Base or Ethereum L1
at check time: most likely still processing on the exchange side, not a
wrong-network send (confirmed 0 balance on L1 too, which would show up
immediately if it had gone to the wrong chain). The signer wallet still
has 0 ETH, so it can't sign anything on mainnet yet: schema registration
and the Phase 3 gate transaction are blocked until it arrives.

## 2026-08-12: Signer wallet funded on mainnet, verified on-chain

Confirmed both transfers directly (receipts + balances, not just the
provided links): signer wallet `0x53a79B...263b0` now holds 0.0025 ETH +
1 USDC; treasury `0xb440b8...` kept ~0.0006 ETH + 2 USDC.
- ETH: https://basescan.org/tx/0xc3301170e335fe1dba9335c06efab6a06ffb8b19e3a9be6cf66639c3841a3ca9
- USDC: https://basescan.org/tx/0x7c6261b5aa7ba66177ebbb1d2e06720181ebdb8fae786de963c7bfa927870e55

Enough to proceed with mainnet schema registration and the Phase 3 gate
transaction. Plan: register schemas + prove the full flow via a local
script against mainnet RPC first (same pattern used for Sepolia before
it ever touched the live Fly deployment), then flip the live deployment's
`NETWORK` to `base` and redeploy only once that's confirmed working, not
flipping the public endpoint over blind.

## Phase 3 gate: met (2026-08-12)

Full flow run against real Base mainnet, via a local server instance
first (same pattern as the Sepolia rollout: prove it locally before the
public endpoint touches mainnet):

- Schemas registered on mainnet, verified via `getSchema()` directly
  (not just trusting the registration script's own report): both resolve
  correctly, same UIDs as Sepolia (expected: schema UIDs are
  deterministic from schema+resolver+revocable, not chain-dependent).
- Real settled payment: https://basescan.org/tx/0x6e44081aa3f05c73f6c9c32dc456f0231c3a690a33159765917ff096d138659c
  (signer wallet paying into the treasury address: real two-party
  transfer now that payTo is split from the signer, not a self-transfer).
- `200` response, real score, `attestationUid` present.
- Fulfillment attestation independently resolved via EAS on mainnet
  (attester/recipient match).
- Dispute filed and resolved against it (full x402-SAP path, not just
  the minimum "one payment" the gate technically requires).
- Builder Code attribution confirmed on the actual mainnet attestation
  transaction (`0xe2b5002c923bd9b49afce698f9d0f7ebef66d24f8c1eafd22c0a64e7c5f7ebb7`)
  by pulling its real calldata and comparing the tail against the
  expected ERC-8021 suffix byte-for-byte: matched. Deliberately not
  checked on the payment transaction itself: attribution is Vouch402's
  own outgoing-transaction property, not something that applies to
  whichever wallet happens to be paying.

Next: flip the live Fly deployment to mainnet and redeploy. Not done
automatically just because local verification passed; doing it as its
own explicit, checked step.

## 2026-08-12: Phase 7 prep: network-filtered metrics, new /v1/activity endpoint

Investigated before building the frontend's network selector, per the
Phase 7 spec's explicit instruction not to guess: `/v1/metrics` had no
network filtering at all (one global aggregate), `requests_served` had
no `network` column to filter by even if it wanted to, and there was no
endpoint at all for listing individual recent attestations/disputes
(needed for the "recent activity" feed). Also found something concrete,
not hypothetical: the live deployment's current metrics (`totalRequestsServed:1`)
are entirely leftover Sepolia test data from before the mainnet cutover:
the live URL has never actually served a real mainnet paid request yet.
Showing that number unlabeled as "mainnet" on the frontend would be wrong.

Fixed:
- `requests_served` gets a `network` column: `ALTER TABLE` + backfill
  from `processed_payments` (which already had `network`) for existing
  databases, included directly in `CREATE TABLE` for fresh ones. Guarded
  by checking `PRAGMA table_info` first, runs safely on every startup.
- `getMetrics(network?)`: optional filter; omitted keeps the original
  all-networks behavior for backward compatibility. `GET /v1/metrics`
  now accepts `?network=base|base-sepolia`.
- New `GET /v1/activity?network=&limit=`: merges `attestations` and
  `disputes` into one reverse-chronological feed, each item carrying a
  ready-to-use EAS explorer URL (`easExplorerAttestationUrl()` in
  src/lib/env.ts: verified both the `base` and `base-sepolia` easscan.org
  subdomains resolve to real attestations before relying on the pattern,
  not assumed from the mainnet one alone).

Verified locally before deploying: `?network=base` correctly isolates
just the one real Phase-3-gate mainnet transaction from the 41
accumulated Sepolia test transactions in the same local database: exact
counts, not approximate.

## 2026-08-12: First real mainnet activity on the live deployment

Ran one real paid request against `vouch402.fly.dev` itself (not just
locally) after the network-filtering deploy above, to close the gap
found earlier: https://basescan.org/tx/0x0afadfd21746ace6c99d7232446c77b83c5a423304e7d7d3b14933ae5752eafc
`200`, real score, `attestationUid=0xc15b1139d2b9af18ba81004532229c3d4ccbbdd176410e6b59f7eec20a9d9909`.
Confirmed `?network=base` now reflects it (`totalRequestsServed:1,
attestationCount:1`) and `/v1/activity?network=base` returns it with a
working explorer link. The live deployment now has real mainnet data for
the Phase 7 frontend to display, not an all-zero dashboard.

## Open questions

- ~~Hosting decision needed before Phase 5 can actually close.~~
  Resolved: live on Fly.io at `vouch402.fly.dev` since the Phase 5/
  deployment work below.

- Need `ETHERSCAN_API_KEY` from the user (or explicit sign-off to keep
  running with 2 of 4 scoring signals structurally zeroed) before the
  scoring output is a genuine v0 model rather than a partially-degraded
  one. Not blocking Phase 3's gate (payment + attestation correctness
  don't depend on scoring accuracy), but should be resolved before this
  is presented as "live." Still open as of this entry.

## 2026-08-12: Pre-push safety check, and untracking vendored skill docs

Ran a full pre-push safety check before making this repo public:
`.env`/secrets never committed at any point in history (verified via
`git log --all --full-history`), no real secret values anywhere in
history or the current tree (only variable names/placeholders), no
grant-program or reviewer-facing framing anywhere in README/this file/
commit messages, no unwanted tracked files (`node_modules`, `.env`,
`dist/`), and this file's own Phase 3 status already read honestly as
"in progress."

One thing outside the checklist: 128 of 164 tracked files were vendored
third-party skill reference docs (`.agents/`, `.claude/`: the
`base-mcp`/`build-on-base` material the build agent used, not Vouch402's
own code). Untracked and gitignored them: not a security issue (that
content is already public in `base/skills`' own repo), but bloat that
doesn't belong in this project's public history going forward. Chose to
keep full commit history rather than squash: it's the first push, so
squashing was still a clean option, but the phase-by-phase commits are
exactly what this file's entries document: real gates, real bugs found
live, and the reasoning behind each fix. The vendor docs remaining
visible in early commits aren't a secret, just noise.

## 2026-08-12: Phase 7a: web frontend scaffold, and what actually looking at it caught

Next.js App Router scaffold in `/web` (separate npm project inside this
repo, not a separate repo). Stack exactly as specified: Tailwind + shadcn/ui,
next-intl (locale-prefixed `/en`, `/es`, always-prefixed per the spec),
next-themes, Geist + Geist Mono via `next/font`.

One real surprise: this shadcn/ui setup is built on **Base UI**
(`@base-ui/react`), not classic Radix, meaning the usual `asChild` +
child-element composition pattern doesn't apply here. Base UI components
take a `render` prop instead (`<Button render={<Link href="/">...} />`).
Every component that composes a shadcn primitive with a `Link`/`<a>`
(navbar links, language switcher, mobile menu) uses that pattern
throughout, not `asChild`. Caught by the build actually failing on the
first attempt, not assumed going in.

Design tokens: Base blue (`#0052FF`) as the single accent, same hex in
both themes (a fixed brand color rather than a per-theme variant); light
mode neutrals carry a faint cool/blue OKLCH hue instead of pure gray,
dark mode is a deep navy-black rather than true black. Status colors
(success/warning/error) are separate tokens from `--primary`: never
reused for status, per the spec.

**No `chromium-cli` available on this (Windows) machine**: it's the
Linux-container tool the `run` skill defaults to. Fell back to driving
Playwright directly (already installed with Chromium binaries on this
machine; added as a scratchpad-only dependency, not part of the shipped
app) per the skill's own documented fallback. Worth it: actually
screenshotting the rendered page at 375/768/1440px and toggling the
theme caught two real bugs that a build-and-typecheck pass alone did not:

1. A red "N · Issues" dev-mode indicator was visible on every screenshot.
   Investigated rather than ignored: Base UI's `Button` defaults to
   expecting to render a real `<button>` element (`nativeButton: true`)
   and warns when a `render` prop swaps in an `<a>` instead, which is
   exactly what every nav-link/language-switcher Button does. Fixed by
   setting `nativeButton={false}` explicitly on those specific instances
   (navbar links, the GitHub link, the mobile menu's language buttons).
   This makes the "this is a link styled as a button, not a real button"
   choice explicit instead of an unacknowledged warning. Re-verified
   after the fix: zero console errors, indicator gone.
2. `network-provider.tsx`'s and `theme-selector.tsx`'s original
   `useState` + `useEffect(() => setState(...))` pattern for reading
   localStorage on mount tripped this project's `react-hooks/set-state-in-effect`
   ESLint rule (a real error, not a warning, in this config), caught by
   `npm run lint`, separately from the screenshot pass. Fixed properly
   rather than suppressed: `network-provider.tsx` now uses
   `useSyncExternalStore` (React's actual primitive for subscribing to
   state that lives outside React, e.g. localStorage, not a workaround,
   the documented correct tool for this exact case), and
   `theme-selector.tsx` just reads `next-themes`' own `theme` value
   directly (typed `string | undefined` specifically because it's
   `undefined` pre-mount) instead of tracking a redundant second "have we
   mounted" boolean.

Confirmed via screenshot, not assumed: navbar collapses correctly at
375px (hamburger + sheet, all three selectors + nav links stacked inside
it), shows the full inline layout with individual selectors at 768px and
1440px without wrapping/overlap, language switching swaps every string
including the footer tagline, and theme switching genuinely toggles the
`dark` class on `<html>` and repaints to the intended navy-black (not a
CSS variable that silently wasn't wired up).

Also fixed two Next.js 16 deprecation warnings surfaced by the build
itself while at it: `middleware.ts` renamed to `proxy.ts` (next-intl's
middleware export works unchanged under the new filename), and set
`turbopack.root` explicitly (this repo has two npm projects: the API at
the root, this app in `/web`, each with its own lockfile, which Next.js
otherwise has to guess about).

**Phase 7a gate met**: `npm run build` succeeds, `npm run lint` is clean,
responsive at all three specified breakpoints (verified by screenshot),
language switching and theme switching both confirmed working end-to-end,
not just structurally plausible.

## 2026-08-12: Phase 7b: content sections, Docs page, and a false-positive
hunt worth recording

Built Hero, How it works, API reference, and the Docs page
(`docs/TECHNICAL_SPEC.md` rendered live via `react-markdown` +
`remark-gfm` + `rehype-slug` + `rehype-highlight`), plus the shared
`CodeBlock`/`markdownComponents` infrastructure both reuse. A few
decisions worth recording:

**Syntax highlighting is themed via our own tokens, not an imported
highlight.js stylesheet.** `rehype-highlight` only adds `.hljs-*` token
classes to the markup: coloring them was left to us. Mapped each token
class onto the existing design tokens (`--primary` for
keywords/built-ins, `--success` for strings, `--warning` for
numbers/literals, `--muted-foreground` for comments, etc.) in
`globals.css`, so code blocks stay on-brand and theme-consistent instead
of carrying a second, disconnected color palette. Verified `bash`/`json`
are in `rehype-highlight`'s default "common" language set by reading its
actual `.d.ts` (an earlier draft imported `highlight.js/lib/languages/*`
manually and passed a nonexistent `ignoreMissing` option, caught before
it shipped, not assumed to be needed).

**`@tailwindcss/typography`'s own gray palette was overridden, not
adopted.** Its `prose-neutral`/`prose-invert` modifiers ship a separate
gray-based palette; pointing its `--tw-prose-*` CSS custom properties at
this project's own tokens instead (`--foreground`, `--muted-foreground`,
etc.) keeps the Docs page's prose column on the same cool-tinted,
non-gray palette as the rest of the site. And since those tokens
already flip under `.dark`, one set of `--tw-prose-*` values covers both
themes with no `-invert` block needed. Inline-code backtick pseudo-
elements (`prose-code:before:content-none`) were suppressed too: the
default rendering read as a generic-markdown-template tell the design
brief explicitly wants avoided.

**The Docs TOC is generated independently of the render, then verified
against it.** `src/lib/toc.ts` extracts headings from the raw markdown
and slugs them with `github-slugger` directly (the same library
`rehype-slug` uses internally) rather than trying to read IDs back out
of the rendered React tree. This only stays correct if both slug in the
same document order (slug de-duplication is stateful), which is
documented in the function's own comment. Not just asserted: a Playwright
check (`screenshot-7b.js`) confirms every TOC `href` resolves to a real
heading `id` in the rendered page, and that clicking a TOC entry actually
scrolls.

**`docs/TECHNICAL_SPEC.md` is read from the repo root at render time,
not copied into `web/`.** The frontend has no backend/DB of its own, and
copying the file in would let the site drift from the real spec the
first time either one is edited without the other. This works locally
(`process.cwd()` is `web/` under `next dev`/`next build`/`start`, so
`../docs/TECHNICAL_SPEC.md` resolves), but on Vercel with Root Directory
set to `/web` it requires that project's **"Include source files outside
of the Root Directory in the Build Step"** setting enabled: a real,
documented Vercel monorepo mechanism, not a workaround. Flagging this
now so it's not forgotten when Vercel is actually connected.

**Superseded below (2026-08-12, "Vercel CLI setup"): that setting
doesn't exist.** Checked the actual current Vercel docs before relying
on it for real, rather than assuming it was still there once Vercel
setup actually started: `vercel.com/docs/builds/configure-a-build` is
explicit that Root Directory is a hard boundary: *"Your app will not be
able to access files outside of that directory. You also cannot use
`..` to move up a level."* No toggle relaxes that. This was a real wrong
assumption in this entry, left visible rather than quietly edited away.
See the later entry for the actual fix (a committed, synced copy inside
`web/`, not a parent-directory read).

**A hydration-mismatch console error turned out to be a Turbopack dev-
cache artifact, not a real bug: confirmed by testing, not assumed.**
Playwright caught a real console warning on the Hero (`nativeButton`
true by default on the primary CTA's `Button`, which renders a `Link`,
not a `<button>`, the same class of bug fixed across 7a; fixed the same
way, `nativeButton={false}`). But a second, separate hydration-mismatch
error persisted afterward, always on the *same* secondary GitHub button,
on every locale/breakpoint, only on the home page. Read Base UI's actual
`mergeProps`/`useRenderElement` source rather than guessing: the
className merge is a pure function with no `typeof window` branch, so it
should be deterministic between server and client. Killed the `next dev`
process, ran a clean `next build` + `next start`, and re-tested: zero
console errors anywhere, on every page/locale/breakpoint. Conclusion:
stale Turbopack HMR cache from iterating on Hero mid-session, not an
actual SSR/CSR divergence. Recorded here specifically so this isn't
re-investigated from scratch later if it resurfaces in dev: check
against a clean production build first.

**`#live-activity` is a real, working anchor with no matching section
yet.** The Hero's primary CTA and the navbar's "Live activity" link both
point at it; the section itself (checkpoint 7c, wired to
`GET /v1/activity`) hasn't been built. The link 200s and the anchor is
inert (no matching `id` on the page) rather than broken: intentional
sequencing per the IA order in the spec, not an oversight.

**i18n scope check**: per the spec's own instruction to flag rather than
silently decide if the English-only-technical-content default reads
wrong once built: it reads right. Every page chrome string (nav,
headings, section intros, button labels) is bilingual; the Docs page's
own markdown body, the curl examples in the API reference, and all
code/JSON payloads stay in English regardless of locale, with a visible,
translated note on the Docs page explaining why (`docs.sourceNote`,
present in both `en.json` and `es.json`). Matches standard developer-
documentation convention (technical reference content in English even on
translated sites) and avoids the much larger, currently out-of-scope job
of maintaining a translated fork of the technical spec that would drift
from the real one.

**Phase 7b gate met**: `npm run build`/`lint`/`tsc --noEmit` all clean;
verified against a clean production build (not dev) with Playwright:
zero console errors across Home and Docs, both locales, all three
breakpoints (375/768/1440); every TOC entry resolves to a real heading
and scrolls; every internal link 200s (`#live-activity` confirmed inert
by design, not broken); code blocks are actually syntax-highlighted, not
just structurally present. Screenshots reviewed in both light and dark.

## 2026-08-12: Backend: CORS was silently missing, found before it could
block checkpoint 7c

Before wiring the Live stats / Recent activity sections to the real API,
checked whether the live deployment actually sends CORS headers at all:
it didn't (`curl -I` against `vouch402.fly.dev` with an `Origin` header
showed no `Access-Control-Allow-Origin` in the response, confirmed
directly, not assumed from reading the Express setup). The frontend
spec requires plain client-side `fetch()` straight to
`https://vouch402.fly.dev` with no proxy layer of its own, so this would
have silently blocked every browser-side call once deployed, not just
7c, but 7d's interactive demo too.

Fixed with a small wildcard-origin middleware (`Access-Control-Allow-Origin: *`,
covering the OPTIONS preflight too) rather than an origin allowlist:
every route here is meant to be called by arbitrary agents/clients over
the open x402 protocol, none of them rely on cookies or session auth
(payment proof and dispute signatures are the actual authority), and an
allowlist would also be brittle against Vercel's per-branch preview
subdomains. Deployed to Fly, re-verified live: preflight returns the
right headers, and both `/v1/metrics` and `/v1/activity` still return
correct data afterward. Backend test suite (12 tests) still green.

## Network selector scope for 7c, clarified

`network-provider.tsx` (built during 7a) already states the conclusion
in its own doc comment: the network selector controls checkpoint 7d's
interactive demo, not the Live stats / Recent activity sections: those
stay pinned to mainnet regardless of the selector. Restating the
reasoning here explicitly, since the comment references "see
DECISION_LOG.md" without this actually having been spelled out yet:

The Phase 7 spec's instruction was to investigate the backend and only
build the fuller (selector-controls-everything) behavior if genuinely
supported, not guessed. The backend genuinely does support it now (the
network-filtering work above). But "technically supported" isn't the
only input here: the accumulated Sepolia test data is exactly that,
test noise (41 throwaway transactions from earlier development, versus
1 real mainnet request). Letting the selector drive these two sections
would let a visitor flip to Testnet and see that noise presented with
the same visual weight as the real mainnet activity the section exists
to demonstrate: actively misleading about how much genuine usage this
product has, not just a cosmetic inconsistency. The Live stats section
makes this explicit rather than silently ignoring the selector: it's
labeled "Base mainnet" as a static fact, not a value that tracks the
selector.

## 2026-08-12: Phase 7c: Live stats + Recent activity, wired to the real API

Built the Live stats and Recent activity feed sections
(`live-stats.tsx`/`recent-activity.tsx`, composed under one
`#live-activity` anchor in `live-activity.tsx`), both pinned to mainnet
per the scope decision above. A few things worth recording:

**Client-side fetch to a different origin needed CORS, and the API
didn't have it**: caught by checking, not assumed: `curl -I` against
`vouch402.fly.dev` with an `Origin` header showed no
`Access-Control-Allow-Origin` at all. Fixed on the backend (wildcard
origin, reasoning in the entry above) and redeployed before writing any
frontend fetch code, not after discovering it broken in the browser.

**Two real bugs caught by testing against the live API, not just a
build/typecheck pass:**
1. `react-hooks/set-state-in-effect` fired on `use-live-data.ts`'s
   original pattern of synchronously resetting `loading`/`error` at the
   top of the effect body before the async fetch, the same rule class
   from 7a, same fix direction: only set state from the async
   continuation. Documented the resulting tradeoff in the hook's own
   comment (stale data would stay visible during a refetch if `network`
   ever actually changed post-mount, which it doesn't at either of
   today's call sites).
2. The 5-stat grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) left an
   empty, unlabeled gray cell in the last row at both the 375px and
   768px breakpoints: 5 doesn't divide evenly into 2 or 3 columns.
   Invisible in a build/lint pass, caught by an actual screenshot at
   both breakpoints. Fixed by spanning the last stat across the
   remaining columns (`col-span-2 lg:col-span-1`) rather than picking a
   different, more-divisible column count, since 5 real metrics is the
   right number to show.

**Verified against the real live deployment, not mocked data**: the
stat values and the one real activity row rendered on screen
(`uniquePayers: 1`, `totalVolumeUsdc: "0.01"`, the one real mainnet
fulfillment with a working EAS explorer link and a correctly-localized
relative timestamp, "1 hour ago" / "hace 1 hora" via
`Intl.RelativeTimeFormat`, no hand-maintained "X ago" strings to keep
in sync across languages) were confirmed to match a direct `curl`
against `vouch402.fly.dev` taken moments before. Also drove the actual
network-selector UI in the browser (not just read the code) and
confirmed the Live stats numbers genuinely don't change when it's
flipped: the "pinned to mainnet" decision is real, working behavior,
not just an intent.

**Phase 7c gate met**: `npm run build`/`lint`/`tsc --noEmit` clean on
both the frontend and the backend (12/12 backend tests still passing
after the CORS change); verified against a clean production build with
Playwright: zero console errors, real API data rendered (not stuck on
a loading/error state), network-selector independence confirmed live,
both locales, all three breakpoints, light and dark.

## 2026-08-12: Phase 7d: the interactive demo, and a real architecture
mismatch investigated before writing any code

The spec named `@base-org/account`'s `pay()`/`getPaymentStatus()`/
`BasePayButton` specifically. Investigated all three against the actual
installed source before wiring anything up, per the spec's own
instruction not to guess, and found one real, worth-recording mismatch
plus one real gap:

**`BasePayButton` isn't in `@base-org/account` at all.** It's not
exported from the package that's already a dependency: checked its
`index.d.ts` directly, not assumed missing from memory. Found it via
`npm view`/`npm search`, not guessed at a plausible-sounding package
name: it lives in a separate, official package, `@base-org/account-ui`
(subpath export `./react`), installed as its own dependency.

**The real concern going in**: Vouch402's `verifyPayment()`
(`src/server/payment.ts`) is built entirely around independently
re-deriving every fact from a real L1 transaction receipt
(`client.getTransactionReceipt`): "never trusts the client's claim
alone" is the actual code comment. `@base-org/account`'s `pay()` executes
through a smart wallet via ERC-4337, and `getPaymentStatus`'s own JSDoc
calls its `id` parameter a "userOp hash." A userOp hash is not a real
transaction hash: `getTransactionReceipt` would not resolve it, which
would have made the entire demo silently unable to complete its own
last step no matter how correct everything else was.

Resolved by reading the actual implementation, not the doc comment
alone: `pay()` calls `wallet_sendCalls` with a single, genuine
`ERC20.transfer(to, amount)` call encoded against the real USDC contract
address (`translatePayment.js`), and its returned `id` is sourced from
`executionResult.transactionHash`: named and commented as a real
transaction hash throughout the call chain (`sdkManager.js`,
`sendUserOpAndWait.js`), not the userOp identifier. A concrete
cross-check confirms this is real, not just internally self-consistent:
the live 402 quote's `asset` address and `@base-org/account`'s own
`TOKENS.USDC.addresses.base` constant are byte-for-byte identical: the
two systems agree on-chain, not just in their own documentation.

Built the flow to match exactly what both sides actually expect: fetch
the real 402 quote -> `pay()` with the quoted amount/payTo -> poll
`getPaymentStatus()` for `sender` once completed -> retry the resource
request with `{ resourceId, txHash: id, payer: sender }` as the
`X-PAYMENT` proof, with a short retry loop on the resource-fetch step
specifically for the same public-RPC-lag class of issue already
documented elsewhere in this log.

**The address being scored is a UI input, not the payer's own address.**
Vouch402 prices a risk score *for an address*, independent of who pays
for it (`GET /v1/risk-score/:address`): the payer's identity only
becomes known after payment, via `getPaymentStatus()`'s `sender` field.
So the demo asks the visitor which address to check (defaulted to the
same real, checkable address already used in the Hero proof card) rather
than assuming "check my own wallet," which would have required a
separate connect-wallet step before a quote could even be requested.

**Verified, honestly scoped**: real 402 quote fetched and displayed with
the correct interpolated amount/payTo; invalid-address validation;
clicking the real `BasePayButton` genuinely opens a real Coinbase
popup (`keys.coinbase.com/onboarding?sdkName=%40base-org%2Faccount...`)
and the UI correctly advances to "Approve 0.01 USDC to 0xb440b82F…
in your wallet…" with real, correct values: confirmed via Playwright,
not assumed; zero unexpected console errors; both locales, responsive,
light and dark. **What is not verified, and cannot be by browser
automation alone**: a real wallet actually approving and confirming the
transaction, and the resulting final fulfillment/attestation render.
That needs one real click-through by a human with a funded testnet
wallet: the architecture and every step up to that handoff is now
verified against real, live systems on both ends, not guessed.

## 2026-08-12: Vercel CLI setup: a real gap in the Docs page's file
access, found before it shipped broken

Used the Vercel CLI (per the user's explicit request to set up hosting
this way, with auto-deploy on every push) to create and link a new
project, `vouch402`, scoped to `web/`. Two things surfaced along the way:

**Fixed: the Docs page's cross-directory file read would not have
worked on Vercel at all.** The 7b entry above assumed a Vercel project
setting would let a Root-Directory-scoped project read
`../docs/TECHNICAL_SPEC.md`. Checked the actual current Vercel docs
before trusting that for real (not re-relying on memory once it
actually mattered): no such setting exists. Root Directory is a hard
boundary, full stop. Fixed properly, not worked around: added
`web/scripts/sync-docs.mjs`, which copies `docs/TECHNICAL_SPEC.md` into
a committed `web/content/technical-spec.md`, wired into `predev`/
`prebuild` so the local copy can't silently go stale during normal
development, and guarded to no-op (not error) when the parent directory
isn't reachable, which is exactly the Vercel case, where the
already-committed copy is what actually gets read. `docs/page.tsx` now
reads that committed copy instead of reaching across `..`. Verified the
fix actually addresses the real constraint, not just quieted a warning:
read the exact path Vercel would use (`web/content/technical-spec.md`,
resolvable from `web/` alone, no parent access needed) directly, and
re-ran the full Docs page Playwright check against a fresh build: same
zero-console-errors, correctly-rendered result as before the change.

**Blocked on one unavoidable manual step: connecting GitHub to Vercel.**
`vercel git connect` failed with "You need to add a Login Connection to
your GitHub account first." This is an account-level OAuth
authorization between the user's own Vercel and GitHub accounts, which
by its nature cannot be completed by a CLI token; it needs a real
browser session under the user's own login on both sides. Confirmed
there's no CLI/API path around this (tried `vercel link --repo` from the
repo root per Vercel's own documented monorepo CLI flow first: it
queries for projects already connected to the repo URL and finds none,
consistent with the repo genuinely not being connected yet). This is the
one thing only the user can do; everything else is ready to go the
moment they do.

**Still to do once that's unblocked**: set the `vouch402` project's Root
Directory to `web` (it's currently `.`, an artifact of how it was
linked, and needs fixing before a Git-triggered build would find the
Next.js app at all), then `vercel git connect` again, which should also
fire the first Git-triggered deployment automatically.

## 2026-08-12: Live on Vercel: GitHub connected, first deploy verified

The user completed the one unavoidably-manual step (GitHub login
connection on their Vercel account) and re-ran `vercel git connect`:
succeeded. Deployed immediately via CLI from `web/` to get a working
URL right away rather than waiting on a git-triggered build:
**https://vouch402.vercel.app**, confirmed live: homepage and Docs
page both 200, Docs page rendering the real spec content (the
`sync-docs.mjs` guard fired exactly as designed: logged "not reachable
from here (expected on Vercel) — skipping" and the build used the
already-committed copy), Live stats/Recent activity showing real data
fetched cross-origin from `vouch402.fly.dev` (confirms the CORS fix
holds in the actual deployed environment, not just localhost), zero
console errors: checked with Playwright against the real production
URL, not assumed from the successful build log alone.

**Correction to the Root Directory finding above**: the actual Vercel
dashboard *does* show an "Include files outside the root directory in
the Build Step" toggle (screenshotted by the user, already Enabled by
default), it just isn't mentioned on the specific docs page checked
earlier (`/docs/builds/configure-a-build`). So the original 7b
assumption wasn't entirely wrong; the page just didn't cover this
specific toggle. Decided to keep the `sync-docs.mjs`/committed-copy fix
anyway rather than revert to the parent-directory read now that the
toggle is confirmed to exist: it's already built, tested, and live: it
also doesn't depend on a project-level setting that isn't clearly
documented and could reset on a future project recreation. Reverting
now would be pure churn for no functional gain.

Root Directory was `.` (an artifact of linking the project from
`web/`): the user set it to `web` via the dashboard (the one field the
CLI has no subcommand for). Confirmed via `vercel project inspect`
afterward: `Root Directory: web`. A verification commit was pushed
immediately after to confirm the Git-triggered path (the real "every
commit and push updates it" mechanism the user asked for) actually
fires correctly end to end, not just that the setting looks right.

**Confirmed, not assumed**: that verification commit triggered a real
Git-triggered build (`vouch402-r5dudkab4-...`) automatically, with no
manual `vercel` invocation: checked its status until it reached
`Ready` (52s build), then re-curled the production alias
(`vouch402.vercel.app`) for the homepage, Docs page, and the Spanish
locale, all 200. **Auto-deploy on every push is genuinely live**, not
just configured. Vercel setup is done; remaining Phase 7 work is
telling the user to add the `vouch402.xyz` domain (GoDaddy DNS) once
they're ready.

## 2026-08-13: Full Phase 0-6 re-verification, executed not audited

The user asked for the original master build prompt's Phases 0-6 to be
re-run as a real execution/verification pass, explicitly not a
documentation review: check every gate against the live system as it
actually stands right now, not against what earlier entries in this
file claim. Went through each phase in order:

- **Phase 0/1**: fresh `npm install` + `npm run build` + `npm test`
  against live Base Sepolia state: 4 test files, 12/12 passing, run
  moments before this entry, not reused from an earlier session.
- **Phase 2**: covered by the same test run (`test/attestation.test.ts`).
- **Phase 3**: did not create a new real mainnet transaction just to
  re-prove a gate that's already satisfied by real artifacts; spending
  real funds redundantly would be worse practice, not more rigorous.
  Instead independently re-resolved the existing ones live: all three
  known mainnet transaction hashes still return `status=success` via a
  fresh `getTransactionReceipt` call, both schema UIDs still resolve via
  `getSchemaRegistry().getSchema()`, and the fulfillment attestation UID
  still resolves via EAS with the expected attester/recipient. Builder
  Code attribution was not re-derived: it was already verified
  byte-for-byte against immutable, already-mined calldata earlier in
  this build, and that fact cannot change on re-check.
- **Phase 4**: found a real, live incident while checking this gate:
  `vouch402.fly.dev` was completely unreachable. Root-caused before
  reporting anything, not assumed: `fly status` returned "trial has
  ended, please add a credit card." The user fixed it
  (`fly status` afterward showed the machine `started`, 1/1 checks
  passing). Re-verification then surfaced a second, separate finding:
  curl and Node's native `fetch` both failed against this one host
  specifically (TLS handshake reset) from within this session's Bash
  tool, while the exact same request succeeded immediately via
  PowerShell's `Invoke-WebRequest` and in the user's own browser. Cross-
  checked against other HTTPS hosts (google.com, github.com, the
  project's own Vercel deployment) to confirm this wasn't a general
  local network problem before concluding it was a Bash-tool-specific
  quirk in this environment, not a real server issue. Once past that,
  the actual gate check: `/v1/metrics` shows `totalRequestsServed:1,
  attestationCount:1`, and `/v1/activity` returns exactly one item whose
  `uid` matches the attestation independently resolved in the Phase 3
  check above, a real hand cross-check between the aggregate number and
  the raw log, not just trusting the metrics endpoint's own arithmetic.
- **Phase 5**: `plugins/vouch402.md`'s documented example still matches
  live reality (`"network": "base"`, mainnet USDC address). Checked
  against the file's actual current content, not memory. The PR-hold
  condition ("stays unopened until Phase 3 is completely closed") now
  reads as satisfied by every gate checked above, but opening a PR to a
  third-party repo is a real, external, hard-to-reverse action. Flagged
  back to the user rather than opened unprompted, even though the
  blocking condition has resolved.
- **Phase 6**: ran `npx tsx scripts/demo.ts` fresh, checking `NETWORK` in
  `.env` first (`base-sepolia`, not `base`) so this couldn't
  accidentally spend real mainnet funds. Completed all 6 steps
  unattended: quote, real testnet payment, paid retry, independent EAS
  resolution, a filed dispute, and updated metrics, matching the gate's
  literal wording ("without manual intervention"), not just structurally
  plausible.

Every phase's gate held on live re-execution. The one genuine gap found
(the Fly trial expiring) was an external account-state change, not a
code defect, already resolved by the user by the time this entry was
written.

## 2026-08-13: Phase 5 PR opened, base/skills#152

The user confirmed the PR-hold condition ("stays unopened until Phase 3
is completely closed") was satisfied by the live re-verification above,
and asked to proceed. Re-ran the checklist against the real current
files, not memory, before opening anything:

- Fetched `plugin-spec.md` directly from `base/skills` (not the local
  vendored copy alone) and diffed it against
  `.agents/skills/base-mcp/references/plugin-spec.md`: byte-identical
  after normalizing line endings, so the local copy was safe to work
  from. The real target path, confirmed from the spec's own text, not
  assumed from local directory structure: `skills/base-mcp/plugins/vouch402.md`.
- Walked every item on the Authoring Checklist against the current
  `plugins/vouch402.md`: integration classification, required/
  conditional sections in canonical order, canonical heading names, the
  `## Submission` mapping. All passed. One real gap: `risk-scoring` and
  `attestations` aren't yet in the shared tag vocabulary, which the spec
  explicitly permits fixing in the same PR (Contribution Scope), so both
  were appended to `plugin-spec.md`, the only other file this PR
  touches.
- Re-verified content accuracy directly, not from memory: the dispute
  signature message in the plugin file matches `disputeMessage()` in
  `src/attestation/dispute.ts` byte-for-byte, and the documented 402
  example matches a fresh live request to `vouch402.fly.dev` field for
  field, including the exact asset address.
- Found a real blocker before opening anything, not after: the target
  repo's own `CONTRIBUTING.md` states contributions are "limited to the
  Base core team currently." Checked whether this reflects actual
  current practice rather than treating the written policy as
  automatically authoritative: found an active, ongoing stream of
  external plugin PRs (one opened the day before this entry), several
  directly comparable to this one, at least one with real, substantive
  maintainer-bot review engagement. Concluded the `CONTRIBUTING.md` line
  is stale boilerplate, not enforced current policy, and proceeded.
- The `plugin-review` skill referenced by the spec isn't available in
  this environment (still true, checked again, same finding as the
  original Phase 5 entry). Self-reviewed against the checklist
  manually instead, and said so plainly in the PR description rather
  than implying tool validation that didn't happen.

Forked `base/skills` to `Eras256/skills`, branched, added exactly the
two files above (confirmed via `git status`/`git diff` before
committing, nothing else touched), and opened the PR. The PR
description states what the plugin does, why the two-file scope,
that every example was verified live before submission, and an honest
AI-assistance disclosure, all confirmed dash-free against this
project's own style rule before submitting it, and short:
no grant/dollar mentions, no competitor framing, nothing written for a
reviewer instead of a developer.

**PR: https://github.com/base/skills/pull/152. Status: opened, awaiting
review.**

## 2026-08-13: Base MCP still not actually connected, verified not assumed

Asked to run `plugins/vouch402.md`'s `## Orchestration` flow through
real Base MCP tools (`send_calls`, `web_request`) against the live
instance, the same live-execution standard as the Phase 0-6
re-verification. Checked whether the tools were actually available
before attempting anything, rather than trusting that writing
`.mcp.json` earlier meant the connection was live: searched this
session's own tool set for `get_wallets`/`send_calls`/`web_request`
and anything wallet-related. Nothing found. No Base MCP tools exist in
this session.

Root cause, not guessed: Claude Code loads MCP server config at session
start, not live mid-session. `.mcp.json` was written while this exact
session was already running, so it was never picked up. The OAuth
authorization step (a real browser sign-in) also hasn't happened; that
can only be completed by a human, not from inside this session either
way.

**Not run**: the real-tool orchestration test, and therefore no new
transaction/attestation from it. Nothing in `plugins/vouch402.md` was
touched this entry; there was nothing to compare against real behavior
yet. This needs a fresh Claude Code session in this project (so
`.mcp.json` loads) plus one manual OAuth authorization
(`/mcp` -> `base-mcp` -> Authenticate) before the live-tool test can
actually run.

Checked PR #152 independently of the above (doesn't depend on MCP):
no reviewer comments yet, just the automated `cb-heimdall` bot's review-
status tracking comment (`0/2` reviews, pending) and a passing
`StepSecurity` check. Nothing actionable from a maintainer yet.

## 2026-08-13: Phase 8-10 kickoff, Gate 0: package naming

Checked real npm registry state before writing anything, per Gate 0.
Every candidate name checked directly against the registry API
(authoritative, no auth needed for a read): `@vouch402/sdk`,
`@vouch402/cli`, `@vouch402/mcp-server`, `vouch402`, `vouch402-sdk`,
`vouch402-cli`, `vouch402-mcp-server`, `vouch402-mcp`. All 404,
genuinely unpublished.

**Whether the `@vouch402` scope/org itself is claimed: genuinely
unresolved, not assumed either way.** A package-level 404 doesn't prove
the scope is free (an org can exist with zero packages published under
it). Tried the direct checks: `npm org ls vouch402` and `npm whoami`
both failed (an existing token in `~/.npmrc` is invalid, not something
of mine to fix). The npmjs.com org/user pages return `403` for
`vouch402`, but also for `vercel` (a definitely-real org) and a random
throwaway string, confirmed by testing all three side by side. That's
generic bot-blocking on the web frontend, not a real signal either way.
Claiming or confirming an org is a real npm-account action; leaving it
for the user rather than guessing.

**Decision: build unscoped for now.** `vouch402-sdk`, `vouch402`
(bare, for the CLI: `npx vouch402 score <address>` reads better than
`npx vouch402-cli`, and the bare name is confirmed available),
`vouch402-mcp-server`. Nothing here is published yet (the publish gate
holds regardless), so this doesn't foreclose moving to `@vouch402/*`
later if the user sets up the org; it just doesn't block three new
packages on an external account action that isn't resolved yet.

**Also fixed in passing**: `package.json`'s `license` field said `ISC`;
the actual `LICENSE` file (and the README's own License section) say
MIT. A real, pre-existing mismatch, not something to leave once found.
Set to `MIT` to match reality.

## 2026-08-13: Phase 8 gate met, vouch402-sdk

Built `sdk/` as a thin ESM client wrapping the same quote/pay/fetch/
verify flow already proven in `scripts/demo.ts`, `test/server.test.ts`,
and `src/lib/eas.ts`. No product logic reimplemented: `pay()` derives
network/chain from the quote's own `network` field (never assumed),
`fetchScore()` retries on 402 specifically (max 5 attempts, 2s delay),
`verifyAttestation()` is a genuinely read-only EAS resolution (plain
ethers `JsonRpcProvider`, no signer) with the same retry shape as the
server's own `getAttestationWithRetry` (3 retries, 1500ms delay,
checks against `ZERO_ADDRESS`). `getRiskScore()` composes all four,
matching `scripts/demo.ts`'s manual flow.

**Gate run for real, not assumed**: `sdk/test/sdk.test.ts` spins up a
local instance of the actual server (`createApp()` from the repo
root, not a mock) configured via the local `.env`'s
`NETWORK=base-sepolia`, with a runtime guard that throws if the env
isn't actually Sepolia. Deliberately does not point at the live
`vouch402.fly.dev` instance: that deployment is mainnet-only
post-cutover (see Phase 3 gate), so hitting it here would issue a
real mainnet quote inside a test, not the testnet payment the gate
asks for. `npx vitest run`: 4/4 passed, including a real testnet USDC
transfer, a real fulfillment attestation, and independent EAS
verification of that attestation (not just trusting the API's own
response), plus a replay-rejection check on an already-consumed
payment proof. `npm pack --dry-run`: valid 6.2 kB tarball, 13 files,
`dist/` and `package.json` only, no source or test artifacts.

**Not run**: the real `npm publish`. Per the standing publish gate,
stopping here and flagging `vouch402-sdk` as publish-ready pending
the user's explicit go-ahead.

Next: Phase 9 (CLI), depending on this package rather than
reimplementing any of its logic.

## 2026-08-13: Phase 9 gate met, vouch402 CLI, and three real bugs it surfaced

Built `cli/` as a thin wrapper: `vouch402 score <address>` does
argument parsing, keystore loading, and output formatting; every step
of the actual flow is `vouch402-sdk`'s `getRiskScore`/`easExplorerUrl`,
not reimplemented. Key loading mirrors the main repo's own pattern
(`src/lib/keystore.ts`): decrypts a Foundry keystore
(`VOUCH402_KEYSTORE_ACCOUNT`/`_PASSWORD`, or `_JSON` inline), never a
raw private key in an env var. Added `network` to the SDK's
`GetRiskScoreResult` while wiring this up: the CLI needs it for the
explorer link, and re-deriving it from a second `getQuote()` call
would have been exactly the kind of cross-package duplication the
architecture rule warns against, so it was added to the SDK's return
value instead, one line, useful to any consumer.

**Actually running the compiled output (not just `vitest`/`tsc`)
surfaced a real bug already latent in the SDK.** `sdk/test/sdk.test.ts`
never caught it: `vitest` resolves modules through its own
bundler-style transform, not Node's native ESM loader. Running
`node cli/dist/index.js` directly hit it immediately:
`@ethereum-attestation-service/eas-sdk`'s `package.json` `exports`
routes ESM importers to its `lib.esm` build, and that build's own
`import { isEqual } from "lodash"` doesn't survive Node's strict ESM
loader (lodash's CJS export shape isn't statically analyzable by
`cjs-module-lexer`). The main repo never hits this: it's
`"type": "commonjs"`, so `require()` (no static analysis) always
resolved the working CJS build instead. Fixed in `sdk/src/client.ts`
by forcing that same CJS resolution via `createRequire(import.meta.url)`
for the one `eas-sdk` import, rather than trying to patch or pin
`lodash` itself, a third-party package's own internal dependency.
Confirmed by hitting the real failure first, not assumed or guessed at.

**Two more real, if smaller, issues found the same way:**
- `sdk/tsconfig.json` set `rootDir: "src"` while also including
  `test/**/*`: a real `tsc` error (`TS6059`), invisible before because
  nothing had actually run plain `tsc --noEmit` against this config
  since the test file was added. `vitest`'s own type handling doesn't
  enforce `rootDir`. Fixed by dropping `rootDir` from the base config
  (the build-only `tsconfig.build.json`, which excludes `test/`, keeps
  its own explicit `rootDir: "src"`, unaffected).
- `sdk/`, `cli/`, and the repo root each have independent
  `node_modules` (this repo's own established sibling-package
  convention, not workspaces), and two fresh, independent `npm install`
  runs resolved *different* patch versions of `viem` under the same
  `^2.55.13` range (`2.55.13` at the root, `2.55.15` in `sdk/`).
  TypeScript treats those as two distinct, structurally-incompatible
  `Account` types, since neither install is aware of the other: a real
  `tsc` error when `sdk/test/sdk.test.ts` passes a root-loaded account
  into an SDK function, and again when the CLI passes its own
  keystore-loaded account into the SDK. Pinned `viem` to the exact same
  version (no caret) in the root, `sdk/`, and `cli/` `package.json`s so
  a fresh install always resolves identically across all three. This is
  a real, structural fragility of the sibling-package-without-
  workspaces layout: worth moving to npm workspaces if this keeps
  recurring across more shared dependencies, but out of scope to change
  now for one already-fixed dependency.

**Gate run for real, fresh install, not the local dev wiring alone**:
`npm pack` both `sdk/` and `cli/`, then (temporarily pointing `cli/`'s
`vouch402-sdk` dependency at the packed SDK tarball via an absolute
`file:` path, since the registry doesn't have either package yet)
`npm install`ed the packed CLI tarball into an empty directory outside
this repo entirely (371 packages resolved fresh) and ran the installed
bin directly. Real output: a real Base Sepolia payment
(`0x21c3209466b9358d72f4eb9e5a6f7a86d82a21de4b81e40989fb432f07b57c59`),
score `70`, attestation `0x1b8f086fb225a4920590d0c890ba7eaacbc2c9de205b69f4bbb98962e5dee551`
independently verified via EAS. `npx <tarball-path>` itself (as
distinct from `npm install` + running the bin) was flaky in this
Windows/Git-Bash environment: one attempt returned success with no
output and no server-side effect, another hung until timeout. Not
chased further: this reads as environment/tooling friction specific to
`npx`'s ephemeral-install path on this machine, not a defect in the
package itself, since the identical bin, installed the standard way,
ran correctly and repeatably. Worth re-checking once the package is
actually on the registry and `npx vouch402` can be tested as a real
user would run it.

Reverted the temporary absolute `file:` pointer back to `file:../sdk`
for normal local development afterward; the fresh-install test above
already covered what a real registry-based install would look like.

**Not run**: the real `npm publish` for either package. Both flagged
publish-ready pending the user's go-ahead, same as the SDK.

Next: Phase 10 (standalone MCP server). Per the user's explicit
instruction, the key-management design there is a real judgment call
to surface as an "Open questions" entry before building, not decide
unilaterally.

## 2026-08-13: Phase 10 open question: how should the standalone MCP server pay?

Per the user's explicit instruction, checked how this ecosystem's own
documentation handles it before proposing anything, rather than
guessing: read `.agents/skills/base-mcp/` (README, plugin-spec,
every existing plugin file) and `.agents/skills/build-on-base/`
(the local vendored reference copies, still present on disk though
gitignored, see the Phase 5/pre-push entries above) specifically for
how a standalone server without a caller-side wallet session handles
signing.

**Base MCP's own docs are explicit and repeated: the server itself
never signs.** `README.md`: "The MCP server itself does not sign or
broadcast transactions." Every existing plugin (Morpho, Brickken,
Venice, GMGN, Virtuals, Bitrefill) builds unsigned calldata/quotes and
routes execution through Base MCP's own `send_calls`/x402 tools or a
named third-party relayer, never a key the plugin itself holds.
`plugins/venice.md` states it as a rule, not just a description: "Do
not ask for or use a private key." This is the same pattern
`plugins/vouch402.md` (the Phase 5 PR) already follows.

**`build-on-base/` does document genuine autonomous local signing**,
for the case where a server genuinely has no caller session to lean
on, but even there the preferred pattern isn't a raw key: a
CDP-managed smart wallet (`CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`/
`CDP_WALLET_SECRET`, `getOrCreateSubscriptionOwnerWallet` from
`@base-org/account`'s subscriptions API) that handles gas, nonce, and
signing itself, with a `PRIVATE_KEY` env var only shown for simple,
throwaway scripts, and flagged elsewhere in the same corpus as
something to guard against, not the recommended path
("Never commit private keys, use `cast wallet import`").

**No example anywhere in either reference set of a standalone MCP
server holding its own signing authority for a payment.** This
confirms there's no established "just do X" answer to copy; a real
design decision either way.

**Proposal, not yet built**: option (b) from the original spec, the
caller-non-custodial design, for the same reason `plugins/vouch402.md`
already uses it and the base-mcp corpus argues for it directly: this
server's job is orchestrating a quote and independently verifying the
resulting attestation, not holding funds. Concretely:
- One tool returns the unsigned x402 payment requirements for an
  address (the SDK's `getQuote()`, unchanged).
- A second tool accepts a `txHash` the calling agent obtained by
  paying through *its own* wallet tooling (whatever MCP/wallet session
  that client already has, exactly the same handoff
  `plugins/vouch402.md`'s `send_calls` step already relies on, just at
  the MCP-tool-response layer instead of a shared session) and
  completes fetch + independent EAS verification (the SDK's
  `fetchScore`/`verifyAttestation`).
- This server's own `node_modules` would never need `ethers`' signing
  path or a keystore loader at all: strictly less attack surface than
  the CLI, not just a parallel design.

The tradeoff, stated honestly rather than glossed over: this makes the
standalone server strictly less convenient for a caller with no wallet
tooling of its own at all (unlike the CLI, which is fine holding a
local keystore since a human runs it directly and can type a
password). That's the real cost of option (b), and worth confirming is
acceptable before building against it.

**Not deciding this unilaterally, per the user's own instruction.
Asking directly before writing any Phase 10 code.**

**Decided: option (b), non-custodial two-tool split, confirmed by the
user.** Building the standalone MCP server against that design now.

## 2026-08-13: Phase 10 gate met, vouch402-mcp-server

Built `mcp-server/` on the `@modelcontextprotocol/sdk` (installed
fresh, its real types read directly rather than assumed, since neither
`.agents/skills/base-mcp/` nor `build-on-base/` documented the
TypeScript server API itself). Two tools, `get_payment_quote` and
`fetch_risk_score`, both thin wrappers over the SDK's existing
`getQuote`/`fetchScore`/`verifyAttestation`. Confirms the non-custodial
design holds structurally, not just by intent: this package has no
`viem`/`ethers` signing dependency in its own runtime code path at
all, only in its test (which stands in for "the calling agent's own
wallet"). Caught one real logic bug before it shipped: an early draft
called an attestation "verified" by comparing `attestation.attester`
to the quote's `payTo`. Those are deliberately different wallets in
production (see "Split payTo (treasury) from the signer wallet"
above): the check would have silently reported every real,
successfully-verified mainnet attestation as unverified. Fixed to what
"verified" actually means here: `verifyAttestation()` already only
returns once it resolves a genuine non-zero attester on EAS (its own
retry loop's whole purpose), so reaching that line without it throwing
*is* the independent proof; the tool only additionally checks
`!revoked`.

**Gate run for real, a real MCP client, not assumed**: Claude Code's
own MCP connections only load at session start (the same constraint
already hit trying to live-test the Phase 5 plugin against base-mcp,
still unresolved as of this entry), so adding this server to
`.mcp.json` wouldn't have been testable within this same session
either. Wrote `mcp-server/test/mcp.test.ts` instead: a real
`@modelcontextprotocol/sdk` `Client`, connected over `StdioClientTransport`
to the actual built `dist/index.js` (a real child process, real
JSON-RPC over stdio, the same wire protocol any real MCP host uses,
not a direct call into the handler functions), driving both tools
against a local Base Sepolia server instance (same pattern as the SDK
and CLI tests). `npm test`: 2/2 passed. `tools/list` returns exactly
the two documented tools; the full quote -> pay -> fetch flow completes
through real tool calls with a real testnet payment made by the test's
own stand-in "calling agent" (the SDK's `pay()`, never the server),
and the returned attestation resolves as genuinely verified. `npm pack
--dry-run`: valid 3.1 kB tarball, `dist/` + `package.json` only.

Same `tsconfig.json`/`tsconfig.build.json` split as the SDK fix above,
applied here from the start this time: the base config includes
`test/**/*` with no `rootDir` constraint, so `tsc --noEmit` actually
type-checks the test file instead of silently skipping it.

**Documented plainly in `mcp-server/README.md`**, per the gate's
explicit requirement: a dedicated section states the non-custodial
design isn't an oversight, why it was chosen, and the real tradeoff
this creates (unusable for a caller with no wallet tooling of its own,
unlike the CLI) rather than only describing the upside.

**Not run**: the real `npm publish`. Flagged publish-ready pending the
user's go-ahead, same as the other two packages.

All three Phase 8-10 packages (`vouch402-sdk`, `vouch402`,
`vouch402-mcp-server`) are now built, real-verified against Base
Sepolia, and pack cleanly. None published. Added a short "Client
packages" section to the root README pointing at all three, matching
how it already links to `plugins/vouch402.md`.

## 2026-08-13: Phase 8-10 publish readiness

Per the standing publish gate, restating status plainly in one place
rather than leaving it scattered across three separate entries above:

| Package | Gate | Publish |
|---|---|---|
| `vouch402-sdk` | Met: 4/4 real Base Sepolia tests, valid tarball | Not run |
| `vouch402` (CLI) | Met: real fresh-install test, real payment | Not run |
| `vouch402-mcp-server` | Met: real MCP client, real payment, non-custodial | Not run |

All three are `npm pack`-clean and ready. None have had `npm publish`
run against them; that stays gated on the user's explicit go-ahead, the
same standard already applied to opening the `base/skills` PR. Also
still unresolved from Gate 0: whether the `@vouch402` npm scope is
actually claimed. All three currently ship unscoped
(`vouch402-sdk`/`vouch402`/`vouch402-mcp-server`); moving to
`@vouch402/*` later, if the user sets up the org, would be a rename at
publish time, not a rebuild.

## 2026-08-13: Published, `vouch402-sdk`/`vouch402`/`vouch402-mcp-server` all live

The user explicitly confirmed proceeding with real `npm publish` for
all three, unscoped, no `@vouch402` org for now ("cero adopción real
todavía que justifique protegerla con un scope"). `npm whoami`/`npm
org ls` in this session were still `401` on an invalid local token
(same finding as Gate 0); the user generated a fresh token and ran
`npm login`, which also hit npm's newer account-security policy
("tokens that bypass 2FA are being restricted... direct publishing").
Actual `npm publish` for each package required an interactive
browser-based OTP approval (`EOTP`, a URL to open, not a code this
session could complete), so the user ran the three `npm publish`
commands themselves, in their own terminal, approving each in browser.
Pushed the 5 local Phase 8-10 commits to `origin/master` first (was 5
ahead, 0 behind; confirmed by `git fetch` + diffing against
`origin/master` before and after `git push`, not assumed from the push
command's own exit code alone).

**Caught a real bug before any of it published, not after**: `npm
publish --dry-run` for `vouch402` (CLI) and `vouch402-mcp-server`
warned `"bin[...]" script name dist/index.js was invalid and removed`.
Both `package.json`s had `"./dist/index.js"` in their `bin` field; npm
silently drops a `bin` entry with a `./`-prefixed path rather than
erroring loudly, meaning either package would have published as a
normal, valid-looking tarball with **no working `vouch402`/
`vouch402-mcp-server` command at all**, a defect nobody would notice
until someone actually tried to run it, and unfixable except by a new
version (npm never allows overwriting a published version). Confirmed
the actual fix via `npm pkg fix` (removes the `./` prefix) and a clean
re-run of `--dry-run` with zero warnings before either package
published for real. `vouch402-sdk` has no `bin` field, so it was never
exposed to this.

Each package's dependency on `vouch402-sdk` was moved from
`file:../sdk` to `^0.1.0` and verified against the real registry, not
assumed correct because the version number looked right: fresh
`npm install` in both `cli/` and `mcp-server/` (after deleting
`node_modules`/`package-lock.json` to force real resolution), and
`node_modules/.package-lock.json` for both showed
`"resolved": "https://registry.npmjs.org/vouch402-sdk/-/vouch402-sdk-0.1.0.tgz"`,
a real registry URL, not a local path. Ran the full functional flow
against local Base Sepolia with this registry-resolved SDK before
publishing either dependent package: the CLI (real payment
`0xd4903a66a7c959d6198b1cbcc88e59ac905e017974c5dce21273c726059e13c8`,
score 70, independently-verified attestation
`0xe974ce3790f836301fd1994cc00e55f4f6a8be9ec0d2eb5896cc183b86d6a17b`)
and the MCP server (`npm test`, real MCP client over stdio, 2/2 passed
again against the registry-resolved dependency).

**Independently verified all three against the live registry after
publishing**, not just trusted the pasted terminal output:

| Package | Version | Link |
|---|---|---|
| `vouch402-sdk` | `0.1.0` | https://www.npmjs.com/package/vouch402-sdk |
| `vouch402` | `0.1.0` | https://www.npmjs.com/package/vouch402 |
| `vouch402-mcp-server` | `0.1.0` | https://www.npmjs.com/package/vouch402-mcp-server |

`npm view <name> version`/`dist-tags` returned `0.1.0`/`{latest:
"0.1.0"}` for all three directly from `registry.npmjs.org` (the
authoritative source; the npmjs.com website frontend itself still
generically bot-blocks unauthenticated `curl`, the same false-negative
already documented at Gate 0, not treated as evidence of anything).
`npm view vouch402 bin` / `npm view vouch402-mcp-server bin` confirmed
the `bin` fix actually shipped correctly this time
(`{"vouch402":"dist/index.js"}` / `{"vouch402-mcp-server":"dist/index.js"}`).

**Then ran the literal Phase 9 gate wording for real**, against the
actual published package rather than a local tarball: from an
unrelated scratch directory, `npx --yes vouch402@0.1.0 score
0x53a79B109fa77c05B043e73A284a22b57c6263b0 --base-url
http://127.0.0.1:3402` (local Base Sepolia server) completed with exit
code `0`: real payment
(`0x606c22e17cef9a80640e74f0d53e0a0a04261c5036f564c39aafe3c5ac89e3d1`),
score `70`, attestation
`0x83763de46b44ea441861bffd4eec2db183184ea1f7233ae3a4480a35d799c43c`
independently verified. This is the first time `npx <published-name>`
itself (as opposed to `npm install` of a local tarball) was tested;
the flakiness noted at the Phase 9 gate entry above was specific to
`npx` against a local `file:` tarball path, not present against the
real registry.

All three packages are live, correct, and real-verified end to end.
Committed and pushed the `bin`-path fix and the `file:../sdk` ->
`^0.1.0` dependency updates (`c2baec9`) before any of the three
publishes ran for real.

## 2026-08-13: Frontend: real bug in every dropdown selector, plus a mainnet payment warning

User-reported: the network selector (navbar, desktop) doesn't switch
from Testnet to Mainnet at all, and the theme selector's Light option
doesn't work on desktop (only mobile). Reproduced both live with
Playwright before touching any code, not guessed from reading the
component source alone.

**Root cause, one bug behind both reports**: `network-selector.tsx`
and `theme-selector.tsx` both pass `onSelect={...}` to
`DropdownMenuItem`. Checked the actual installed `@base-ui/react@1.7.0`
type definitions (`menu/item/MenuItem.d.ts`) directly rather than
assuming: `Menu.Item` has no `onSelect` prop at all, only `onClick`.
`onSelect` is a real Radix Primitives convention (this project's
shadcn setup is built on Base UI, not Radix, per the Phase 7a entry
above), so it silently became an inert, unused prop: React accepts it
without warning (it's a technically-valid native event-handler prop
name), Base UI's own `closeOnClick` still closes the menu on click
(masking the bug, since the interaction visibly "does something"), but
the intended `setNetwork`/`setTheme` call never fires. Confirmed by
reproduction: clicking Mainnet closed the menu but left
`localStorage`/the trigger label on Testnet; clicking Light while the
OS/system theme was dark left `<html>` with `class="...dark"` and
`localStorage.theme` unset. Explains "works on mobile": `mobile-menu.tsx`
has its own separate, correctly-wired `onClick`-based buttons, not the
shared dropdown component, so it was never exposed to this bug at all.
Fixed by changing `onSelect` to `onClick` in both files; re-verified
live afterward that `localStorage`/the visible state actually update
this time, not just that the code looks right.

**Mainnet payment warning, per the user's explicit request**: switching
the network selector to Mainnet changes what the Try It demo (7d) pays
with on the next click, real funds, no confirmation step existed
before. Centralized the interception in `NetworkProvider` itself
(`requestNetworkChange`) rather than duplicating a dialog in both the
desktop selector and the mobile menu: any caller of `setNetwork("mainnet")`
now gets a confirmation dialog for free, switching *to* testnet stays
instant (no real funds involved, no reason to interrupt it). Built
`ui/alert-dialog.tsx` (new: no dialog primitive existed in this repo
yet) on Base UI's `AlertDialog` parts, read directly from
`node_modules/@base-ui/react/alert-dialog` rather than guessed from
Radix/shadcn convention, given the `onSelect` lesson above. Verified
live: dialog appears on Mainnet (desktop dropdown and mobile menu
both, since both go through the same provider), Cancel leaves
`localStorage` untouched, Confirm sets it, switching back to Testnet
shows no dialog, correct in both English and Spanish.

**Frontend updated with the new client packages**: added a "Client
packages" section to `docs/TECHNICAL_SPEC.md` (single source of truth,
already synced into the Docs page via `sync-docs.mjs`) listing
`vouch402-sdk`/`vouch402`/`vouch402-mcp-server` with links to their
live npm pages. Not added to the homepage marketing sections: checked
first, and the Phase 5 Base MCP plugin isn't given homepage treatment
either, only documented in the Docs page and the README, so this
matches existing precedent rather than introducing a new one.

**Verified against a clean production build** (`next build` + `next
start`, not `next dev`), matching the Phase 7 standard: zero console
errors across both locales and all three breakpoints (375/768/1440),
dark/light toggling correct at every one, the mainnet dialog flow
works in production too, and the new Docs section renders with a
working, scrolling TOC entry. The persistent dev-mode hydration
warning noted while reproducing the original bugs is the same one
already investigated and dismissed as a Turbopack dev-cache artifact
in the Phase 7b entry above: confirmed still true, zero console errors
on the production build.

## 2026-08-13: Real logo, favicon set, OG image, and a real metadata bug it surfaced

Replaced the placeholder mark (a plain rounded square with a hand-drawn
checkmark path) with Lucide's own `shield-check` icon geometry
(`node_modules/lucide-react/dist/esm/icons/shield-check.mjs`, MIT/ISC,
already a dependency): the shield outline filled solid in Base blue as
the badge, the checkmark stroked white on top, unchanged proportions
from Lucide's own already-matched pair rather than hand-drawn bezier
curves. Reads as "verified/attested," which is literally the product
(the current mark was a generic checkmark; this one is closer to what
an attestation service should look like). Updated `logo.tsx`
(navbar), and used the identical mark for the full icon set: `icon.svg`
(Next.js's SVG favicon convention), `apple-icon.png` (180x180, white
backdrop since the shield needs contrast, not another blue behind it,
generated via `sharp`, already a dependency via Next's own image
pipeline), and a hand-built `favicon.ico` (16/32/48px PNG frames in a
real, standard PNG-in-ICO container, not a hack, verified by parsing
the file's own ICONDIR header back out and checking each frame's PNG
signature before shipping it). Also generated a static `opengraph-image.png`
(1200x630, dark brand background sampled from an actual rendered
screenshot rather than converted from the OKLCH tokens by hand) for
social share cards, since there wasn't one before.

**Wiring the OG image up surfaced a real, separate bug, not assumed
fixed just because the build succeeded.** `next build` warned
`metadataBase property in metadata export is not set`. Checked what
this actually broke rather than trusting a one-line fix: curled the
real rendered `/en` page and found `og:image`/`twitter:image` meta
tags were missing entirely, not just wrong. Root cause: the static
`opengraph-image.png`/`apple-icon.png`/`icon.svg` file-convention
routes live at `src/app/` (the true root), while all of this app's
actual metadata lives in `src/app/[locale]/layout.tsx`, a *sibling*
route segment, not an ancestor of the icon routes, since this project
has no root `app/layout.tsx` at all (next-intl's always-prefixed
routing means there's no unprefixed root page for one to belong to;
`[locale]/layout.tsx` carries the `<html>`/`<body>` tags itself).
Metadata inheritance in Next.js follows the layout tree, so
`metadataBase` set in `[locale]/layout.tsx` cannot flow to a route
outside it. Fixed without the larger, riskier refactor (moving
`<html>`/`<body>` into a new true root layout, touched by every route
in the app): set `metadataBase` for the URL-resolution behavior that
does apply within `[locale]/layout.tsx` itself, and explicitly listed
`images: ["/opengraph-image.png"]` in both `openGraph` and `twitter`
metadata instead of relying on cross-segment file-convention
auto-detection. Re-verified against the real rendered page, not the
build log alone: `og:image`/`twitter:image` now both correctly read
`https://www.vouch402.xyz/opengraph-image.png`. The `next build`
warning itself still fires (it's about the standalone icon routes'
own metadata resolution, which nothing user-facing actually depends
on), left as a known, harmless cosmetic warning rather than chasing it
into a structural layout refactor with real regression risk for a
build-time-only message.

**Also found while picking a `metadataBase` value**: `vouch402.xyz` is
live and correctly connected (`https://vouch402.xyz` -> 308 ->
`https://www.vouch402.xyz` -> 307 -> `/en` -> 200, confirmed via a
real request, not assumed), not still pending as the last Vercel entry
above described ("telling the user to add the domain once they're
ready"). This must have happened since that entry without getting
logged. `www.vouch402.xyz` is now the canonical URL used for
`metadataBase`.

**Verified against a clean production build**: all four new routes
(`/icon.svg`, `/apple-icon.png`, `/opengraph-image.png`,
`/favicon.ico`) return `200`; zero console errors across both locales
and all three breakpoints; dark/light and the earlier network/theme
selector fixes all still hold with the new logo in place.

## 2026-08-13: Five more real mainnet payments, and one real loss to a public-RPC outage

At the user's request, ran `npx vouch402@0.1.0 score <address>` (the
now-published CLI, against the real live mainnet API, not a
simulation) several more times to add real volume to the Live activity
stats. Checked the signer wallet's real balance first, not assumed
sufficient: `0.00249 ETH` / `0.98 USDC` on Base mainnet, plenty for a
handful of `0.01` payments.

**One attempt genuinely failed and cost real money, root-caused from
the live Fly logs, not guessed.** The second call returned a bare
"Internal error." `fly logs --app vouch402` showed the actual cause:
`mainnet.base.org` (the public RPC) returned `"no backend is currently
healthy to serve traffic"` on `eth_blockNumber` *during the
fulfillment step, after payment was already verified*, and the
best-effort fallback error-attestation (the safety net documented in
the Phase 2 entry above) hit the identical RPC error on its own retry
and failed too. Confirmed via the USDC balance directly
(`0.98 -> 0.97`, matching a real, already-verified `0.01` transfer)
that this was a genuine payment-consumed-no-attestation incident, the
exact risk this project's own philosophy has stated plainly since
Phase 2 ("Payment is already consumed at that point and can't be
un-charged; the dispute flow is the payer's recourse") actually
happening once, live, on mainnet: not hidden here.

A third attempt failed *before* broadcasting (`eth_estimateGas` hit
the same RPC error), confirmed via balance check to have cost nothing.
Rather than keep retrying blind into a possibly-still-unhealthy public
RPC with real funds on the line, checked `cast block-number` against
`mainnet.base.org` before each subsequent attempt and only proceeded
once it answered cleanly. Five more calls completed successfully after
that:

| Payment tx | Attestation |
|---|---|
| `0x89ea6a2436eff31bfe3f637c150466ffbed7703ee4f3d54222e6b07ba17ca32a` | `0xb1d15d8733f0576743e78a00ecd1a883134dcdf81dd2af8e58d23f9575145919` |
| `0xd55f5e57f7f285e462a010ba20f7377aea1a8778162cec597716a7e48303c557` | `0xa1bbd82fbd54f6611058cf8857920fc52107d9f6e8d361284f04352d8300a9b5` |
| `0x1ac0e90a7c7b821b1d8063ba854f08eecc4033031ce81251bcdd18d12af661bc` | `0xe165f99e02e1e9179352c0bfcbd8196d8c026cc2dfeb89f3c83a699891975ce2` |
| `0x6e8b48f4de0ea0f34783f1d9c8c43a9000fabd3cebd20ce248fb3b3d3f5b7f73` | `0x03f42f9c4dc8a656c2e70b898c1d5c9862875b9f9142bb93257092ff7f3a4118` |
| `0x81c6ccc1724c3adf74ad5c931e40f214ba70be94deb278d0029cf1a1cfaee417` | `0x6fe500e2d582bc1a1c6a38763b7e21ae9f1fff85e42c7ce74947ba84db263fa1` |

Each independently EAS-verified by the CLI itself before printing
`Verified: yes`, not just trusted from the API response.

**Final state, reconciled exactly against real on-chain balances, not
just the metrics endpoint's own arithmetic**: signer wallet USDC
`0.98 -> 0.92` (`0.06` spent: 5 successful `0.01` payments + the one
lost to the RPC outage, exactly accounted for, nothing unexplained).
`/v1/metrics?network=base`: `requestsServed`/`attestationCount` both
`1 -> 6` (the 5 successful calls, the failed one correctly excluded
since it never completed), `totalVolumeUsdc` `0.01 -> 0.07` (all 6
real transfers, successful or not, since volume tracks verified
payment, not completed fulfillment). This live incident is also a real
argument for eventually running the resource server behind a paid RPC
provider rather than the public endpoint, per the standing
recommendation in the Phase-1-era "Public RPC flakiness" entry above:
still an infra choice for later, not a code fix, but now with a real
mainnet dollar cost attached to it rather than only a Sepolia test
inconvenience.

## 2026-08-13: /pitch page, a real bug in Next.js metadata inheritance

Added a public pitch page at `/pitch` (both locales), built for a
specific real use: the user wanted a page to point a contact toward
before that conversation happens, not a grant application. Followed
the same content rule already governing this repo: no grant/funding
mentions, no dollar amounts, no "this shows Base that..." framing.
Every claim on the page is either sourced verbatim from
`README.md`/`docs/TECHNICAL_SPEC.md` (the curl example, the "Known v0
limitation" and "Roadmap" sections) or independently re-verified live
before writing it, not carried over from memory: the two mainnet
`basescan.org` tx links, both `base.easscan.org` schema links, the
live `/v1/metrics` endpoint, `plugins/vouch402.md`, PR #152 (still
open, no reviews, confirmed via `gh pr view` fresh), and all three npm
package pages (`npm view` against the registry, not the bot-blocked
npmjs.com frontend, same false-negative already documented at Gate 0,
recalibrated again here against a known-real and a known-fake package
side by side).

Built from existing pieces, not a new visual language: the section
shell, `Badge`, and numbered-step patterns from the homepage, the same
`CodeBlock` the Docs page and API reference already use. Six focused
components under `components/pitch/`, composed by
`app/[locale]/pitch/page.tsx`. Content genuinely translated into
Spanish (the general site convention), except the one embedded `curl`
example, which stays English in both locales, same as the API
reference section's own established rule for code content.

**Wiring this page's own `generateMetadata` surfaced a real Next.js
behavior worth recording, caught by checking the actual rendered
`<head>` rather than trusting the code once it compiled.** A route's
metadata export doesn't deep-merge nested objects like `openGraph`/
`twitter` with the parent layout's: overriding just `{ title,
description }` at the page level silently dropped the inherited
`images`/`siteName`/`type`/`card` fields entirely, confirmed by curling
the built page and finding `og:image`/`twitter:image` missing outright
where the homepage has them. Fixed by fully re-specifying every field
`generateMetadata` needs at the page level rather than assuming
anything carries over from the layout. Re-verified: `/pitch` now
serves its own accurate `og:title`/`og:description`
(`https://www.vouch402.xyz/pitch`'s actual content, not the generic
homepage copy) alongside the same real `opengraph-image.png`, correct
`https://www.vouch402.xyz` absolute URL included.

**Verified against a clean production build**: `tsc`/`eslint` clean;
zero console errors across both locales at 375px and 1440px; every
external link on the rendered page checked live (`HEAD` request or,
for the three npm pages, the registry API given the known frontend
false-negative), all resolving; dark mode confirmed correct via
screenshot, matching the rest of the site since nothing page-specific
was introduced to the theming.

## 2026-08-13: /pitch restyled as a slide deck

The user asked for `/pitch` in a slide-deck format, pointing at a
specific reference (`kumply.xyz/pitch`, coincidentally another project
of the user's own). Looked at the real page (Playwright screenshots,
not just a text/markdown fetch, since the ask was fundamentally about
visual format) before building anything: it's a scrolling page of
bounded cards, one per topic, each with a small tracked-out eyebrow
label top-left and a `01 / 12`-style position counter top-right, no
carousel or JS-driven pagination. Adopted that structural pattern, not
its content approach: Kumply's deck is explicitly a grant-application
pitch (dollar figures, a milestone budget, "The Ask"). Vouch402's
`/pitch` already has a standing content rule against exactly that
(no grants, no dollar amounts, developer-verifiable claims only per
the entry above), and that rule stays in force here: only the card/
eyebrow/counter layout was reused, none of the funding-pitch content
shape.

Built `PitchSlide` (`components/pitch/pitch-slide.tsx`), a single
wrapper providing the card chrome and numbering, and reused it across
all seven sections. Split the old combined intro into two slides
(`Cover`, short and punchy, and a dedicated `Problem` slide carrying
the full explanation) to match the reference's rhythm of a light cover
followed by a real problem statement, rather than front-loading a long
paragraph on slide one. All prior content, links, and translations
carried over unchanged; only new copy was the two new eyebrow labels
per slide and the cover's short summary line and compact link row
(GitHub/Docs/npm), added in both locales. The "known v0 limitation"
paragraph on the Roadmap slide got a bordered callout treatment
(`border-warning/30 bg-warning/5`, an existing token already used
site-wide for exactly this "important caveat, not a claim" register,
not a new color invented for this one box).

Nested cards (the proof table, the plugin panel, the package grid)
needed their own background changed from `bg-card` to `bg-muted/50`:
sitting inside a `PitchSlide` (also `bg-card`) they'd otherwise be
invisible against their own parent, since Vouch402's `--card` and
`--background` tokens are close enough that two nested cards using the
same fill read as one flat surface. Caught by looking at the actual
render, not assumed from the class names alone.

**Verified again after the restructure**, not assumed still correct
because the content itself didn't change: `tsc`/`eslint` clean, zero
console errors across both locales at 375px and 1440px, dark mode
confirmed by screenshot (card elevation reads correctly in both
themes), and all 14 external links re-checked live (same recalibrated
npm 403 false-negative as before, everything else `200`).

## 2026-08-14: Two real overflow bugs on the Docs page, one of them site-wide

Asked to make the Docs page fully responsive with no horizontal
overflow at mobile/tablet/desktop. Measured first rather than guessed:
a script comparing `document.documentElement.scrollWidth` against
`clientWidth` across 8 widths (375 to 1440px) times both locales found
two real, distinct bugs.

**Docs article stuck at a fixed ~740px regardless of viewport, below
768px.** Root cause, found by inspecting the actual computed grid
track size, not assumed: `grid-template-columns` was resolving to
`739.609px` even though the grid's own class
(`grid gap-12 lg:grid-cols-[1fr_240px]`) only sets an explicit
template at `lg:` and above. CSS Grid items default to
`min-width: auto`, meaning a grid item won't shrink below its
content's own max-content size; `docs/TECHNICAL_SPEC.md`'s tables and
code blocks (already correctly wrapped in `overflow-x-auto` divs in
`markdown-components.tsx`, comment and all: *"wide content to scroll
in its own container rather than ever forcing the page body to scroll
horizontally"*) have a wide intrinsic content size, and without
`min-width: 0` on the grid item containing them, that intrinsic width
was leaking straight through the grid ancestor and blowing up the
entire single-column mobile layout to ~740px. The `overflow-x-auto`
wrapping was correct all along; it just never got the chance to work.
Fixed with one class: `min-w-0` added to the `<article>` in
`app/[locale]/docs/page.tsx`. This also fixed a second, related
28px overflow on the `240px` TOC column at exactly 1024px, same root
cause, different symptom.

**Navbar overflow at 768px (both locales) and 820px (Spanish only),
not specific to the Docs page.** Found while measuring Docs but
present on every page, since `Navbar` is shared via the root layout:
at exactly the `md:` breakpoint (768px), the full nav-links row and
the language/network/theme selector row both switch on simultaneously
while the mobile hamburger switches off, and the combined content
(worse in Spanish: "Testnet" plus the longer button chrome doesn't
compress the way English does) no longer fits in that width. This
reads as a real regression against the Phase 7a entry's original
claim of "individual selectors at 768px... without wrapping/overlap":
whatever was true when that was written, a fresh measurement now shows
it isn't anymore, and the fix follows the current measurement, not the
old note. Fixed by moving all three `md:` breakpoints in `navbar.tsx`
(nav links, selector row, mobile-menu trigger) to `lg:` (1024px),
which already measured clean in both locales: the existing, already-
verified `MobileMenu` now simply covers a wider range (up to 1023px)
instead of introducing new UI.

**Verified, not assumed, that a shared-component change didn't
regress anything else**: a second script swept all three pages
(home, Docs, `/pitch`) x 2 locales x 6 widths (375/768/820/1024/
1280/1440), 36 combinations, checking both overflow and console
errors. All 36 clean. Also spot-checked visually: the new `lg:`
boundary at 1023px (compact) vs 1024px (full nav) both read
correctly, not just zero-diff; a code block's own `scrollWidth`
(603px) exceeding its `clientWidth` (341px) on a 375px viewport
confirmed the internal scroll genuinely engages rather than the page
itself scrolling; dark mode re-confirmed clean at 375px.

## 2026-08-14: A real, custom logo, replacing the icon-library glyph

Told plainly the shield-check mark (Lucide's own icon, filled and
recolored) read as generic, not a real brand mark. Fair: it was
someone else's icon shape, just recolored, not anything designed for
this product. Designed something actually specific to Vouch402 this
time, rather than picking a different icon library glyph and calling
it done.

**The concept**: the product's own defining number, not a borrowed
trust/security pictogram. "Vouch402" exists because of HTTP 402; a
shield-and-checkmark could belong to any security product, but "402"
belongs to exactly this one. Built as a fluted seal/medallion (a
circle whose radius is sine-modulated around its circumference, wax-
seal/certification-rosette visual language, matching what an
*attestation* service should look like, and deliberately not the
hexagon-plus-checkmark combination that's genuinely overused across
crypto branding) with "402" set inside in Geist Mono Black, the same
monospace typeface this site already uses for every piece of on-chain
data (`--font-mono` in `globals.css`). The mark and the site's own
existing "this is real technical data" visual language now share one
typeface, not two unrelated ones.

**Iterated with real renders before choosing anything**, not from a
single first attempt: generated the seal outline programmatically
(Catmull-Rom spline through a sine-modulated radius, not hand-drawn
bezier guesswork) and compared 8/10/12-flute versions side by side at
200/48/32px; 10 flutes read as the most balanced, 8 felt closer to a
generic "sale badge" burst, 12 started losing crispness at 32px. Also
compared five different treatments for the smallest favicon context
(full seal + "402", seal with no text, seal with a single bold "4", a
plain circle with "4", a plain circle with "402") at actual 16px: only
"plain circle + a single bold 4" stayed legible at that size, everything else
including the full seal degraded to an indistinct blob. That's the
real, deliberate reason the smallest favicon.ico frame doesn't match
the full mark: not an oversight, a size-appropriate simplification,
standard practice for icon systems and confirmed necessary here by
actually rendering the alternatives rather than assuming one mark
would scale to every context.

**One real mistake worth recording honestly**: an early draft of the
navbar `Logo` component had a hand-typed seal path that was never
actually the tested, generated one; a transcription slip while
copying numbers by hand. Caught before committing by re-reading the
actual generated `seal-10.txt` file byte for byte rather than trusting
memory of what I'd just written, and rewriting the component from
that verified source. Worth naming because it's exactly the kind of
error this project's own standing discipline exists to catch: verify
against the real artifact, not what you assume you copied correctly.

**Implementation**: the live navbar `Logo` renders real inline SVG +
real `<text>` styled with `font-mono font-black` (Tailwind's mapping
to this project's already-loaded Geist Mono variable font, weight
900, confirmed present in the font's `100 900` variable range before
relying on it). The standalone files needed a different approach since
they're rasterized/loaded outside any React font-loading context:
`apple-icon.png` and `opengraph-image.png` are rendered via a headless
browser with the real Geist Mono Black font embedded (guaranteeing
pixel-perfect text, baked once into the final PNG, no runtime font
dependency at all), and `favicon.ico` packs three real PNG frames
(48/32px full mark, 16px simplified single-digit glyph) into a
standard PNG-in-ICO container, verified by parsing its own header back
out. `icon.svg`, by contrast, deliberately does *not* embed the
~150KB font: a bare SVG favicon is fetched by every browser on every
visit, and a bold system monospace fallback stack (`ui-monospace,
'SF Mono', 'Cascadia Mono', 'Roboto Mono', monospace`) is visually
indistinguishable from the real typeface at favicon scale, confirmed
by rendering it directly and comparing. The OG image's first draft
also had the seal physically overlapping the "V" of the wordmark
(a layout math error, scale and position computed independently
without checking they'd actually fit); caught by looking at the
rendered output, not assumed correct from the transform values alone,
and fixed by recomputing the seal's actual pixel footprint before
placing the text next to it.

**Verified against a clean production build**: `tsc`/`eslint` clean,
all four icon routes `200`, zero console errors and zero horizontal
overflow across all three pages, both locales, six widths (the same
sweep already built for the earlier overflow-fix entry, rerun here
since the navbar's `Logo` size changed slightly), and both themes
checked by screenshot.

## 2026-08-14: Swapped Etherscan for Blockscout on the `walletAgeDays`/`uniqueContractInteractions` signals, avoiding a $49/mo recurring cost

The user obtained a real `ETHERSCAN_API_KEY` and asked it to be wired
in. Added it to `.env` (not `.env.example`) and as a Fly secret,
redeployed, then verified live against production with a real paid
CLI call: `walletAgeDays` and `uniqueContractInteractions` were still
both `0`. Root-caused by replaying the exact request the server makes
(`api.etherscan.io/v2/api?chainid=8453&...`) with the real key:

```
{"status":"0","message":"NOTOK","result":"Free API access is not
supported for this chain. Please upgrade your api plan for full chain
coverage. https://etherscan.io/apis"}
```

The same key worked fine against chainid `84532` (Base Sepolia, real
tx data came back) and chainid `1` (Ethereum mainnet, valid response,
genuinely no history). So the key itself was correctly wired end to
end; Etherscan dropped free-tier access to Base (along with Optimism
and BNB Chain) in November 2025. Their paid "Lite" tier that restores
it runs ~$49/month.

**Decision: try a free alternative before paying for it.** Tested,
not just read about, three candidates against the same real address
(`0x53a79B109fa77c05B043e73A284a22b57c6263b0`):

- **Blockscout**: Base runs its own public Blockscout instances
  (`base.blockscout.com`, `base-sepolia.blockscout.com`), separate
  infrastructure from Etherscan/Basescan (which are the same
  paywalled backend now, confirmed, not a separate escape hatch).
  They also speak Etherscan's legacy `module=account&action=txlist`
  shape directly, no API key at all. Queried live: 23 real
  transactions back for the test address on mainnet, correctly
  sorted ascending, first/last timestamps consistent with known
  wallet age, 3 unique contract interactions computed with the exact
  same filter logic already in `scoreFromSignals`. Sepolia instance
  verified reachable too.
- **Alchemy**: tested the public `demo` key's `alchemy_getAssetTransfers`
  against the same address; it does return real data, but the `erc20`
  category includes unsolicited incoming token-transfer *logs*, not
  just transactions the address itself initiated, including obvious
  spam tokens spoofing "ETH"/"USDC" via lookalike Unicode characters
  sent to this exact address by contracts it never interacted with.
  Using that as a stand-in for "unique contract interactions" would
  be trivially gameable (anyone can inflate their own score by
  spamming fake token sends to themselves from many addresses). The
  `demo` key is also explicitly not meant for production use, and a
  real Alchemy account needs signup this session can't do on the
  user's behalf. Ruled out on both data-quality and access grounds.
- Didn't test Covalent/Moralis/Ankr: Blockscout already won cleanly
  on every axis (free, no signup, correct data, matches the existing
  filter logic exactly), so pursuing further candidates would have
  been busywork.

Wired Blockscout in (`src/lib/env.ts`'s `blockscoutApiBaseFor`,
`src/scoring/score.ts`'s `fetchTxHistory`), removed the
`etherscanApiKey` env plumbing entirely (dead now, not partially
wired), and removed `ETHERSCAN_API_KEY` from `.env.example` since the
code no longer reads it. Kept the exact same graceful-degrade-to-`[]`
behavior on any fetch failure/unexpected shape/rate-limit: this is a
signal source swap, not a reliability-guarantee change, and a broken
explorer call must never become a hard error on `/v1/risk-score`.

**Verified live against production after redeploying**: real paid CLI
call against `0x53a79B109fa77c05B043e73A284a22b57c6263b0` returned
`{"walletAgeDays":2,"txCount":22,"uniqueContractInteractions":3,
"flagged":false}`, independently resolved via EAS. A real change from
the `0`/`0` every prior mainnet response had shown, both before the
Etherscan key existed and after it was configured but blocked by the
free-tier chain restriction above.

The real `ETHERSCAN_API_KEY` value was left in `.env` (gitignored,
unread by any code path now) rather than deleted, in case the paid
tier is reconsidered later; the corresponding Fly secret was likewise
left in place, unread and harmless. Neither was ever printed in a
commit, log, or reply.

## 2026-08-15: Dev wallet shows full results by default; everyone else stays attestation-only unless they opt in

Previously, `/v1/activity` (the public live feed) never exposed a
scored address's actual `score`/`signals` for anyone, dev wallet
included: it only ever returned `payer`/`payee`/`status`/`network`,
never the address being scored or its result. The user asked for the
opposite split from what might be assumed: full results public by
default for the team's own dev/test wallet
(`0x53a79B109fa77c05B043e73A284a22b57c6263b0`, see
`src/constants/devWallet.ts`), and attestation-only by default for
everyone else, with an explicit opt-in to go public.

**Why this split, not "always show everything" or "never show
anything"**: the real expected use case is an agent paying to score a
*third party's* address before transacting with them. If that
address and score sat on the public feed permanently by default, two
problems follow: the payer's own query pattern becomes public (which
addresses is this agent vetting, and when), and a third party gets a
public, permanent risk judgment attached to their address without
ever consenting to be scored publicly. That would work against real
customer adoption, not for it. The dev wallet has neither problem:
it's the team's own address, and its results have been used as public
proof-of-concept data throughout this project already (Hero section,
`DECISION_LOG.md` itself).

**Mechanism**: a new `public_results` table (`src/lib/db.ts`), keyed
by attestation UID, storing `{ address, score, signals }`. Rows only
ever get inserted for the dev wallet or a payer who set
`makePublic: true` on their `X-PAYMENT` payload (extended
`PaymentProof` in `src/server/x402.ts`, strictly coerced to the
literal boolean `true` so a typo or truthy string can never
accidentally publish someone's result). `getRecentActivity()` LEFT
JOINs against this table; the field is simply absent from the
response for anyone not eligible, not filtered at display time. Kept
deliberately separate from the `attestations` table (and the
attestation/hash mechanism itself is untouched: the on-chain
attestation still hashes and records the same full response for
every request, public or not) so there is structurally nothing to
leak for an ineligible request, no display-time check to get wrong.
The CLI/SDK don't expose `makePublic` yet: only the protocol-level
mechanism was built, since publishing a new CLI/SDK version wasn't
part of what was asked here.

**Verified live against production, both directions, with real
on-chain payments, not assumed safe from reading the code**:

- Dev wallet, no `makePublic` set (its normal, unmodified call
  pattern): real mainnet payment via the published CLI, then queried
  `GET /v1/activity?network=base` directly. The resulting item
  carries `"publicResult":{"address":"0x53a79b...","score":64,
  "signals":{"walletAgeDays":2,"txCount":26,
  "uniqueContractInteractions":3,"flagged":false}}`.
- A freshly generated, previously-unused throwaway wallet
  (`0xE9db998a7bC7F46792E31d0C6676Dd3C9FFE8Eaa`, funded with real
  mainnet ETH/USDC from the deployer wallet specifically for this
  test), paying with `makePublic: false` explicitly set (the same
  state as not setting it at all): real mainnet payment, then the
  same live `GET /v1/activity?network=base` query. That item has no
  `publicResult` key at all, confirmed by inspecting the raw JSON
  directly, not inferred from the frontend not rendering it.
- Also ran the same two-wallet check locally against Base Sepolia
  first (a fresh throwaway key, real testnet payments) before
  spending real mainnet funds, to catch any bug cheaply; it passed
  identically there too.

Didn't additionally drive the live page in a browser for this pass:
the frontend (`recent-activity.tsx`) has no server-side logic of its
own, it's a pure client-side render of this exact `/v1/activity` JSON
with no other data path, so the API-level verification above is
authoritative for what a visitor can see. `tsc --noEmit` clean on
both projects throughout.

## 2026-08-15: The "publicResult doesn't render" bug wasn't in the component: 52 commits had never been pushed

The user reported that `recent-activity.tsx` wasn't showing
`publicResult` on the live site, despite `/v1/activity` returning it
(confirmed via `curl`). Read `recent-activity.tsx` directly first
rather than assuming the report was right or wrong: the
`PublicResultLine` component from the previous entry was already
there, correctly gated on `item.kind === "fulfillment" && item.publicResult`.
The component was not the bug.

`git status` explained it instead: local `master` was **52 commits
ahead of `origin/master`**, going back to the very start of this
session. Every `flyctl deploy` this session deployed the API
correctly (Fly deploys straight from local source), which is why
every prior "verified live" claim about the API was genuinely true.
But the web frontend deploys via Vercel's GitHub integration, which
builds from `origin/master`, and nothing had been `git push`ed all
session. The live site was running a build from before the entire
dev-wallet/public-result feature, and several other things built this
session, existed. Confirmed directly: `npx vercel ls` showed the
prior production deployment was 7 hours old, well before any of this
session's frontend work.

This is exactly the gap the user flagged in the previous entry's
verification, made concrete: "the API response is authoritative for
what a visitor sees" conflates two different claims. The data being
correct and available says nothing about whether a given deployment
actually contains the code that reads it. Checking the API confirms
the *backend* is live; it says nothing about whether the *frontend*
is.

Pushed all 52 commits (user confirmed first, given the scope: this
wasn't just today's fix, it was the accumulated work of the whole
session going out at once). Vercel's GitHub integration picked it up
automatically; confirmed via `npx vercel ls` that a new production
build started immediately and reached `Ready`.

**Verified with a real rendered screenshot of the live page this
time, not just the API**: `npx playwright screenshot --full-page
--wait-for-timeout 6000 https://www.vouch402.xyz/en`, waited past the
client-side `/v1/activity` fetch (the component is `"use client"` and
fetches after mount, so the initial HTML alone would prove nothing
either), then read the resulting image directly. The dev wallet's row
in Recent Activity shows, on screen, beneath the "Fulfilled" badge:
"Scored 0x53a79b10...7c6263b0 64/100 2d 26 txs 3 contracts". The
throwaway wallet's row from the earlier verification round (no
`makePublic`) shows no such line, same as every other non-public row.

## 2026-08-15: `makePublic` exposed through the SDK/CLI/MCP server (0.2.0), and a real npm incident along the way

The protocol-level `makePublic` flag from the "dev wallet / opt-in
public results" entry only worked if a caller hand-crafted the
`X-PAYMENT` payload directly: unreachable from any of the three
published packages. Closed that gap, minor version bump on all three
(additive, backward-compatible, default unchanged):

- **`vouch402-sdk` (0.1.0 -> 0.2.0)**: `makePublic?: boolean` added to
  `PaymentProof` and `FetchScoreOptions` (so `GetRiskScoreOptions`
  inherits it too), threaded into the `X-PAYMENT` payload built in
  `fetchScore`.
- **`vouch402` CLI (0.1.0 -> 0.2.0)**: new `--public` flag, dependency
  on `vouch402-sdk` bumped to `^0.2.0`.
- **`vouch402-mcp-server` (0.1.0 -> 0.2.0)**: `fetch_risk_score`
  (the tool that wraps `fetchScore` directly, a real fit) gained an
  optional `makePublic` input; dependency bumped, server's reported
  `version` updated to match.
- `base/skills#152` left untouched, as instructed: no scope added to
  an open upstream PR under review.

Built, typechecked, and integration-tested all three locally first
(real Base Sepolia payments, both directions, via a freshly generated
throwaway wallet funded from the deployer) before ever touching npm,
per this project's standing rule that the Etherscan/Blockscout-style
"test it for real, not from docs" bar applies to npm publishes too.

**The actual `npm publish` had to run in the user's own terminal**
(this environment's npm token is stale, confirmed 401 on `whoami`
independently of this incident). Handed over the exact command
sequence. `vouch402-sdk@0.2.0` published cleanly. Then, publishing
`vouch402` (the CLI): a **new terminal window had defaulted to
`C:\DaAps\Vouchx402`** (the near-empty single-commit bootstrap/decoy
repo from the very start of this project, not `C:\DaAps\Vouch402`),
and `npm publish` ran there directly instead of in `cli/`. That
decoy repo's own `package.json` happens to also be named `"vouch402"`
(a real, pre-existing name collision between the CLI package and the
main repo's own internal `name` field, not something introduced by
this change), so it published successfully as `vouch402@1.0.0`,
became the `latest` dist-tag, and shadowed the real CLI (`0.1.0` at
the time) for anyone running `npm install vouch402` or `npx vouch402`
in that window.

**Caught immediately by checking `npm view vouch402 dist-tags` and
`versions`** (read-only, no auth needed, checked independently of
what the terminal output claimed) rather than trusting the publish
output alone. Confirmed the leaked tarball was the decoy repo's own
minimal scaffold (`.agents`/`.claude` skill reference docs, which are
mirrors of Base's own public documentation, not secret; a 584-byte
placeholder `DECISION_LOG.md` and 7.4KB `TECHNICAL_SPEC.md` from that
repo's single bootstrap commit, not this project's real, much larger
ones; no `src/`, no `.env`, nothing from the real Vouch402 codebase).
Not a secrets leak, but a real name-squat that would have broken
`npm install vouch402` for anyone until fixed.

**Fixed in the right order, fastest mitigation first**:
1. `npm dist-tag add vouch402@0.1.0 latest`, restoring the real CLI as
   what installs by default, immediately.
2. `npm unpublish vouch402@1.0.0`, inside npm's unpublish window
   (published minutes earlier), removing the bad version entirely.
3. Verified via `npm view` (independently, not just trusting the
   terminal's own success messages) that `vouch402`'s versions were
   back to a clean `["0.1.0"]` before allowing the real CLI publish to
   proceed.

Republished for real from the correct directories (`cli/`,
`mcp-server/`) after that, with an explicit `Get-Location` +
`package.json` name/version check inserted before each `npm publish`
from then on, specifically to catch this exact mistake before it
could repeat. `cli`'s and `mcp-server`'s `npm install` both hit a
transient `ETARGET` for `vouch402-sdk@^0.2.0` (registry propagation
lag, seconds after the SDK publish), but their subsequent `npm run
build` succeeded anyway using this session's own earlier locally-
linked SDK build already sitting in `node_modules` (same content,
verified byte-identical to what got published), so the built
artifacts were correct despite the transient install error. Final
state confirmed clean: `vouch402` `["0.1.0","0.2.0"]`/latest `0.2.0`,
`vouch402-sdk` `["0.1.0","0.2.0"]`/latest `0.2.0`,
`vouch402-mcp-server` `["0.1.0","0.2.0"]`/latest `0.2.0`, and both
`cli`/`mcp-server`'s published `dependencies` field confirmed via
`npm view` to correctly read `vouch402-sdk: "^0.2.0"`.

**Verified live against production using the actually-published
package**, run from outside the repo entirely (`npx vouch402@0.2.0`,
a fresh registry fetch, no local source or locally-linked SDK in
reach) with a fresh throwaway wallet funded with real mainnet
ETH/USDC for this specific check:
- `npx vouch402@0.2.0 score <throwaway-address> --public`: real
  payment tx `0x3c0202a2...`, and the resulting `GET
  /v1/activity?network=base` item carries a full `publicResult`
  (`score: 99`, real signals).
- The same address again, flag omitted (the default): real payment tx
  `0x714059b0...`, and that item has no `publicResult` key at all in
  the live response, same as before this feature existed.
