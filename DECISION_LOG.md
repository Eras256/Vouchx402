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

## 2026-08-12 — Builder Code attribution: verified directly, not inferred

Sent a trivial 0-value self-transfer through `getEasSigner()` (the same
signer every EAS call uses) and compared its on-chain calldata byte-for-
byte against the expected `ox/erc8021` suffix, rather than trusting that
the wiring was correct because the test suite still passed. Confirmed on
Base Sepolia: calldata `0x62635f7a743976613433320b0080218021802180218021
802180218021` ends with the exact `80218021...` marker.
(https://sepolia.basescan.org/tx/0x4a991a1ee3683866b89312152d26d1693e859df4e77a4407ee94ed3163e1af5c)

## 2026-08-12 — Phase 4: /v1/metrics, and a real nonce-race bug it surfaced

Added `attestations` and `disputes` tables (src/lib/db.ts), written from
the single choke points that create them (`attestFulfillment`,
`submitDispute`) so counts stay accurate even for `status=Error`
fulfillments that never produce a `requests_served` row. `/v1/metrics`
is a straight read of these tables — no estimation, no caching.

Building its test (pay-and-fulfill immediately followed by reading
metrics) surfaced a second real bug from the same root cause as the
EAS-read staleness above: right after the payment tx confirmed, the
*next* transaction from the same address (the fulfillment attestation,
sent via ethers) failed with `REPLACEMENT_UNDERPRICED` — ethers'
"pending" nonce lookup landed on a Cloudflare backend node that hadn't
caught up with the just-mined payment tx yet, computed an already-used
nonce, and the resend was rejected. Confirmed live, not inferred from the
test alone. Fixed with `withNonceRetry()` (src/lib/eas.ts): retries
`sendTransaction` a few times with backoff on nonce-collision errors
specifically, re-deriving the nonce from scratch each attempt (never
reusing a stale one). Same mitigation philosophy as
`getAttestationWithRetry` — targeted at the specific failure signature
observed, not a blanket retry-everything wrapper.

## 2026-08-12 — Phase 5 draft: plugins/vouch402.md, and a real blocker it surfaced

Read the current `.agents/skills/base-mcp/references/plugin-spec.md` in
full before writing anything (not from memory or from how this build
prompt described it). One correction that check caught: the build prompt
suggested `agent-commerce` might need adding to the tag vocabulary — it's
already there. Two tags genuinely are new and get appended to that
vocabulary list as part of the eventual PR: `risk-scoring`, `attestations`.

Classified `integration: http-api` — Vouch402 returns payment
requirements then JSON data, never calldata for the caller to submit
itself; the only Base MCP call in the flow is the `send_calls` USDC
payment. `risk: [irreversible]` — payment settles before the caller knows
whether fulfillment will succeed, and there's no refund path, only the
dispute flow.

**Real blocker, not a formality**: `requires.allowlist` and the
`## Endpoints` section need a real public host, and Vouch402 has never
been deployed anywhere reachable — every phase so far has run against
local dev + direct Base RPC/EAS calls. This gap was never addressed
anywhere in the phase list. Wrote the plugin file with every section that
*is* independently verifiable against the actual code (endpoint shapes,
request/response bodies, orchestration steps, submission mapping) but
left `requires.allowlist` as an explicit `TODO-vouch402-not-yet-deployed`
placeholder rather than inventing a domain — a plugin file with a
fabricated host would look done without being true, which is exactly what
the stricter Phase 5 bar rules out.

The bundled `plugin-review` skill isn't available in this environment
(not in the invocable skill list) — self-reviewing against the Authoring
Checklist manually, but that self-review can't complete honestly until
the hosting gap above is resolved (the checklist requires a real
`allowlist`/endpoint host to check against).

## 2026-08-12 — Deployment groundwork: Fly.io, blocked on account billing

User chose Fly.io for hosting (resolves the Phase 5 blocker above once
live). Built the production path:

- `Dockerfile` — multi-stage, `node:24-slim` (matches the Node version
  `node:sqlite` was confirmed working unflagged on locally, not a generic
  LTS guess). Production build uses a dedicated `tsconfig.build.json`
  (`rootDir: src`) instead of the root tsconfig — the root config's
  `rootDir: "."` was nesting compiled output under `dist/src/...` and
  compiling `test/**/*` too (which isn't even copied into the Docker
  build stage). Caught by actually running the build locally before
  writing the Dockerfile's `CMD`, not assumed from the tsconfig as
  written.
- `src/lib/keystore.ts` now accepts the encrypted keystore JSON inline via
  `DEPLOYER_KEYSTORE_JSON` (a Fly secret), falling back to the local
  `~/.foundry/keystores/<account>` file for dev. The private key never
  needs to be baked into a Docker image layer — the deployed instance
  only ever holds the still-encrypted JSON plus the password secret,
  both as Fly secrets.
- `fly.toml` — region `dfw` (matches the user's other Fly apps), 512MB,
  scale-to-zero (`min_machines_running: 0`, cost-conscious for a
  low-traffic v0 service), `NETWORK=base-sepolia` — **not** `base` yet,
  since the Phase 3 mainnet gate isn't actually met. Flip this once it
  is, not before.
- Verified the compiled build actually boots and serves real data
  (`GET /v1/metrics` against `node dist/server/index.js` locally)
  before treating any of this as done.

**Blocked**: `flyctl apps create` failed — the account has overdue
invoices (`fly.io/dashboard/vaiosx/billing`). Not something to work
around; needs the user to clear it. Everything above is ready to deploy
the moment that's resolved.

## 2026-08-12 — Deployed live; found a real gap via the trial account's kill policy

Live at `https://vouch402.fly.dev`. Fixed one real bug before it worked
at all: `req.protocol` read `http` even over HTTPS, because Fly
terminates TLS at the edge and Express doesn't trust the forwarded
proto by default — the 402 body's `resource` field was claiming an
insecure URL. Fixed with `app.set("trust proxy", true)`; confirmed the
field reads `https://` correctly afterward, not just assumed.

Running a real paid request against the live deployment (to verify the
deployed instance's own keystore-secret decryption and EAS signing
actually work, not just the local path) surfaced something more
important: the account this app was created under is on Fly's free
**trial** tier, which force-kills any machine after 5 minutes of runtime
regardless of activity ("add a credit card to run longer than 5m0s").
The kill landed mid-request — payment already verified and marked
processed, but the attestation/response never completed, so the caller
got nothing back for a payment that had already gone through.

That's not just a trial-tier quirk to shrug off: `auto_stop_machines:
"stop"` (our own scale-to-zero config) sends the *same* SIGINT on any
idle auto-stop, so a real request racing a normal scale-down could hit
the identical failure mode later, trial tier or not. Added graceful
shutdown (`src/server/index.ts`): SIGINT/SIGTERM now drains in-flight
requests (stop accepting new connections, let existing ones finish, 25s
cap) instead of Node's default immediate exit. Verified against real
behavior, not assumed correct from adding the handler alone — the
before-state (payment recorded, no attestation, no response) is on the
live volume as `uniquePayers:1` with `attestationCount:0` from that
first attempt.

**Still needs the user**: the trial 5-minute cap itself isn't something
graceful shutdown fully solves — a request that's still running at the
25s drain cap would still be cut off, just less abruptly than before.
Add a credit card to the Fly account (`neuralsol7@gmail.com`) to lift the
trial cap for real reliability.

Re-ran the same live paid request after the graceful-shutdown redeploy:
clean `200`, real `attestationUid`, and `/v1/metrics` moved by exactly
what was expected (`totalRequestsServed`/`attestationCount` +1 for the
successful run; the earlier killed attempt only shows up in
`totalVolumeUsdc`/`uniquePayers`, which is the correct distinction —
payment was genuinely processed even though nothing was ever delivered
for it). Phase 5's hosting blocker is resolved.

## 2026-08-12 — Phase 6: demo.ts caught a real gap in the retry helper itself

First full run of `scripts/demo.ts` (the Phase 6 gate — a single
unattended script running the whole flow) failed at the dispute step: a
bare `sepolia.base.org` 502 came back as a **thrown exception**, not a
zeroed/not-found struct. `getAttestationWithRetry` only ever retried on
the not-found-struct case — a thrown error skipped the retry loop
entirely and propagated straight up. Fixed by wrapping the read in
try/catch too, retrying either failure mode with the same backoff budget
and only surfacing the real error once retries are exhausted. Re-ran
`scripts/demo.ts` clean afterward: 402 → real payment → 200 with
attestation → independently resolved via EAS → dispute filed and
resolved → `/v1/metrics` reflecting all of it. Phase 6 gate met.

## 2026-08-12 — Hardening pass: malformed-input 500s, unbounded quote growth

Three issues found by reading the actual failure paths, not from a
specific bug report:

- `GET /v1/risk-score/:address` mapped *any* non-`PaymentVerificationError`
  thrown while decoding the `X-PAYMENT` header into a bare 500 "Internal
  error" — including a client sending garbage in the header, which isn't
  a server fault. Decoding is now a separate try/catch, mapped to 400.
- `POST /v1/disputes` had the same shape of bug: a malformed `signature`
  made `recoverMessageAddress` throw a raw viem error that fell through
  to the catch-all 500. Now caught and re-thrown as `DisputeError` (400).
- `GET /v1/risk-score/:address` is public and unpaid on the *first* call
  — every hit inserts a `quotes` row, and nothing ever deleted one.
  Unbounded growth on a public endpoint against a small (1GB) volume:
  sustained hammering (or just a crawler) would eventually fill the disk.
  Swept opportunistically in `insertQuote()` itself (delete expired,
  unconsumed rows before inserting the new one) rather than adding a
  cron/scheduler — self-throttles under any traffic shape, no new moving
  parts.

Also extracted `scoreFromSignals()` (src/scoring/score.ts) as a pure
function separate from the network-fetching logic around it, specifically
so the scoring formula has real unit test coverage (test/score.test.ts)
that doesn't inherit the public Base Sepolia RPC's flakiness the rest of
this suite is stuck with.

## 2026-08-12 — Re-verified plugins/vouch402.md against the live instance

Per the stricter Phase 5 bar (verify every claim against actual live
behavior, not memory): pulled fresh responses from `vouch402.fly.dev`
rather than trusting what was written when the file was drafted before
deployment existed. Found one real drift — the example `402` response
body showed `"network": "base"` and mainnet USDC's address, but the live
instance currently returns `"network": "base-sepolia"` and Sepolia USDC
(correct: mainnet cutover hasn't happened yet). Fixed the example to show
what the service actually returns right now, with a note that both
fields are already derived from live config and will read `base`/mainnet
USDC automatically post-cutover — no plugin-file edit needed then.
`/v1/metrics`'s documented shape was checked the same way and matched
exactly.

## Open questions

- **Hosting decision needed before Phase 5 can actually close.** Vouch402
  needs to be deployed somewhere publicly reachable (a domain + a running
  instance of the Express server) before `plugins/vouch402.md` has a real
  `requires.allowlist` value and before the PR is submission-ready. This
  is a real infra/cost decision (platform, domain, who pays for it) —
  not guessing at a provider or fabricating a placeholder domain.

- Need `ETHERSCAN_API_KEY` from the user (or explicit sign-off to keep
  running with 2 of 4 scoring signals structurally zeroed) before the
  scoring output is a genuine v0 model rather than a partially-degraded
  one. Not blocking Phase 3's gate (payment + attestation correctness
  don't depend on scoring accuracy), but should be resolved before this
  is presented as "live."

## 2026-08-12 — Pre-push safety check, and untracking vendored skill docs

Ran a full pre-push safety check before making this repo public:
`.env`/secrets never committed at any point in history (verified via
`git log --all --full-history`), no real secret values anywhere in
history or the current tree (only variable names/placeholders), no
grant-program or reviewer-facing framing anywhere in README/this file/
commit messages, no unwanted tracked files (`node_modules`, `.env`,
`dist/`), and this file's own Phase 3 status already read honestly as
"in progress."

One thing outside the checklist: 128 of 164 tracked files were vendored
third-party skill reference docs (`.agents/`, `.claude/` — the
`base-mcp`/`build-on-base` material the build agent used, not Vouch402's
own code). Untracked and gitignored them — not a security issue (that
content is already public in `base/skills`' own repo), but bloat that
doesn't belong in this project's public history going forward. Chose to
keep full commit history rather than squash: it's the first push, so
squashing was still a clean option, but the phase-by-phase commits are
exactly what this file's entries document — real gates, real bugs found
live, and the reasoning behind each fix. The vendor docs remaining
visible in early commits aren't a secret, just noise.
