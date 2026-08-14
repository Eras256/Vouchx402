# Agent / Builder Code Notes

This file exists for whoever (human or agent) next touches this codebase's
transaction-sending paths: read it before adding a new one.

## What the builder code is

`BUILDER_CODE` (`src/constants/builderCode.ts`, currently `bc_zt9va432`) is
the value returned by Base's builder-code registration API
(`api.base.dev/v1/agents/builder-codes`) for Vouch402's deployer/payTo
wallet. It's not a secret; it's meant to be version-controlled. It
identifies Vouch402 as the originator of the transactions it sends, for
Base's own attribution/analytics tracking.

**Do not re-register.** Re-running registration for the same wallet would
generate an unrelated new code and orphan this one. If registration is ever
genuinely needed again (e.g. a new sending wallet), see
`.agents/skills/build-on-base/references/agents/register.md`.

## How attribution is attached in this project

Vouch402's only on-chain writes are through the EAS SDK (schema
registration, attestations), signed by the deployer wallet. Rather than
attaching the ERC-8021 suffix per call, `AttributedWallet`
(`src/lib/eas.ts`) subclasses `ethers.Wallet` and overrides
`sendTransaction` to append `DATA_SUFFIX` (`src/lib/attribution.ts`) to
every transaction sent through it: client-level attribution, not
per-call, so nothing can slip through unattributed as new call sites are
added.

Verified directly (not just inferred from a passing test): a real Base
Sepolia transaction's calldata was checked byte-for-byte against the
expected suffix; see DECISION_LOG.md.

## Warning

**Never send a transaction that bypasses `AttributedWallet` / `getEasSigner()`.**
There is no error or warning when attribution is missing, just silent,
permanent data loss for that transaction's attribution. If a future
change adds a *new* way to sign and send (e.g. a raw viem walletClient for
something other than payment verification, which never sends its own
transactions today), it must also carry `DATA_SUFFIX`; see
`.agents/skills/build-on-base/references/builder-codes/viem.md` for the
viem-side pattern (`dataSuffix` on the wallet client config).
