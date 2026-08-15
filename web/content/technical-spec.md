# Vouch402: Technical Specification

x402-metered on-chain risk intelligence for autonomous agents on Base, with
a built-in proof-of-fulfillment attestation layer.

## Problem

x402 (HTTP 402-based payments for machine-to-machine commerce) defines how
an agent pays for a resource. It does not define how anyone (the payer, the
seller, or a third party) can later verify whether the paid resource was
actually delivered. Once a payment settles, there is no portable, queryable
record connecting that payment to a fulfillment outcome. This makes it hard
to build reputation, credit, or dispute-resolution systems for agent-to-agent
commerce on top of x402 today, because there is no fulfillment data to build
them from.

Vouch402 addresses one instance of this problem directly (it is itself an
x402-paid data service), and ships a small, reusable protocol layer,
**x402-SAP (Service Attestation Protocol)**, that any x402 resource server
could adopt to close this gap generally.

## Architecture overview

```
┌─────────────┐   402 + requirements    ┌───────────────────┐
│  AI Agent   │ ───────────────────────▶│   Vouch402 API    │
│  (payer)    │◀─────────────────────── │  (resource server) │
└─────────────┘   pay, retry w/ proof    └────────┬───────────┘
                                                    │ verify payment
                                                    │ (server-side)
                                                    ▼
                                          ┌───────────────────┐
                                          │  Risk scoring      │
                                          │  (reads Base RPC)  │
                                          └────────┬───────────┘
                                                    │ on success
                                                    ▼
                                          ┌───────────────────┐
                                          │  EAS attestation    │
                                          │  (fulfillment proof)│
                                          └───────────────────┘
```

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `8453` | `84532` (Base Sepolia) |
| RPC | `https://mainnet.base.org` | `https://sepolia.base.org` |
| Explorer | basescan.org | sepolia.basescan.org |

## API

### `GET /v1/risk-score/:address`

x402-gated. First request without payment proof returns `402` with x402
payment requirements (price, `payTo`, asset = USDC on Base, a `resourceId`).
A retried request with valid payment proof returns:

```json
{
  "address": "0x...",
  "score": 0-100,
  "signals": {
    "walletAgeDays": 0,
    "txCount": 0,
    "uniqueContractInteractions": 0,
    "flagged": false
  },
  "attestationUid": "0x..."
}
```

`score` is derived from public on-chain signals (wallet age, transaction
count, unique contract-interaction diversity, and membership on a bundled,
versioned flag list). This is a v0 heuristic, documented as such, not
presented as a complete risk model. `attestationUid` points to the
`X402ServiceFulfillment` record created for this specific response (see
below), letting any party independently verify what was returned via its
`responseHash`.

### Public results (`makePublic`)

Every fulfillment is attested on-chain either way, but the address, score,
and signals are shown on Vouch402's public activity feed only when the
payer opts in. By default a fulfillment shows on the feed as just that: a
fulfillment happened, with no address or outcome attached. Setting
`makePublic: true` on the payment proof opts that specific result into
being shown in full.

Reachable through any of the three client packages: `{ makePublic: true }`
on `vouch402-sdk`'s `getRiskScore`/`fetchScore`, `--public` on the CLI, or
the `makePublic` argument on the MCP server's `fetch_risk_score` tool. One
exception: Vouch402's own dev/test wallet shows full results by default,
without needing the flag, since its results have already been used as
public proof-of-concept data throughout this project.

### `GET /v1/metrics`

Public. Aggregate, real (not estimated) counters: unique payers, total
requests served, total volume (USDC), attestation count, dispute count.

### `POST /v1/disputes`

```json
{ "refUID": "0x...", "reasonCode": 0, "details": "string" }
```

`reasonCode`: `0 = non-delivery`, `1 = malformed-response`,
`2 = stale-data`, `3 = other`. The caller must be the original payer on the
referenced fulfillment attestation (verified via signature, not a claimed
address). Files an `X402ServiceDispute` attestation linked to the original.

## Client packages

Three thin wrappers over the same API above, none reimplementing its
logic:

- **[`vouch402-sdk`](https://www.npmjs.com/package/vouch402-sdk)**: a
  TypeScript client library (`getQuote`, `pay`, `fetchScore`,
  `verifyAttestation`, and a composed `getRiskScore`). The CLI and the
  MCP server both depend on it rather than duplicating its payment-flow
  code.
- **[`vouch402`](https://www.npmjs.com/package/vouch402)**: a CLI,
  `npx vouch402 score <address>`, for checking a single address from a
  terminal. Pays with a locally-held Foundry keystore, never a raw
  private key.
- **[`vouch402-mcp-server`](https://www.npmjs.com/package/vouch402-mcp-server)**:
  a standalone [MCP](https://modelcontextprotocol.io) server. Never
  holds a wallet or signs a transaction itself: one tool returns an
  unsigned payment quote, a second tool takes the resulting transaction
  hash from whatever wallet tooling the calling agent already has and
  completes the flow, matching this spec's "Non-custodial by
  construction" section below.

## Payment verification (server-side, mandatory)

Every paid request is verified server-side before the resource is released:

1. Reject if the payment/transaction ID has already been processed (replay
   protection).
2. Confirm the payment status is settled/completed.
3. Confirm the paying address matches the request's claimed payer.
4. Confirm amount and recipient match what was quoted in the `402` response.
5. Mark the payment as processed **before** returning the resource.

Frontend-reported payment confirmation is never trusted on its own.

## x402-SAP: attestation schemas (EAS, deployed on Base)

### `X402ServiceFulfillment`

```
address payer
address payee
bytes32 x402PaymentRef
bytes32 resourceId
uint8   status        // 0=fulfilled, 1=timeout, 2=error
bytes32 responseHash  // keccak256 of the exact response payload
uint64  fulfilledAt
```

Emitted automatically by the resource server immediately after a successful
(or failed) fulfillment of a paid request. Attestations are immutable by
design (EAS), so outcomes are never edited after the fact: a disagreement
is expressed as a separate, linked attestation instead (below).

### `X402ServiceDispute`

```
bytes32 refUID       // UID of the disputed X402ServiceFulfillment attestation
address disputant
uint8   reasonCode    // 0=non-delivery, 1=malformed-response, 2=stale-data, 3=other
string  details
```

### Known v0 limitation

Fulfillment attestations in this version are self-attested by the resource
server (the seller), not by a neutral third party. This is an intentional,
explicitly-scoped starting point: it establishes the data format and
produces a real, queryable fulfillment history, while decentralized or
neutral-party verification (e.g. staking/slashing, multi-attester
consensus) is left as a deliberately separate, future layer built on top of
this data, not solved by this specification.

## Builder Code attribution

All outgoing onchain transactions carry ERC-8021 attribution
(`ox/erc8021`), configured at the client level so no transaction is sent
unattributed.

## Non-custodial by construction

Vouch402 never holds, custodies, or transmits funds belonging to a third
party. It sells data for a fee paid directly to its own receiving address.
It is not an intermediary between any two other parties' funds, and it does
not offer custody, exchange, or transfer of virtual assets to its users.

## Testing

Integration tests exercise the full flow against Base Sepolia: unpaid
request -> `402` -> real testnet USDC payment -> retried request -> `200` with
score + attestation UID -> attestation independently resolvable via EAS.
Disputes are tested by filing one against a known fulfillment attestation
and confirming the `refUID` link resolves correctly.

## Roadmap (technical)

The attestation data this service produces, a growing, queryable graph of
`(payer, payee, outcome, dispute)` records, is designed to be consumable
by future systems that need agent reputation or dispute-resolution
signals, without requiring those systems to re-instrument every individual
x402 resource server themselves.
