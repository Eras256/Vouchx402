# Vouch402

x402-metered on-chain risk intelligence for autonomous agents, with a
built-in proof-of-fulfillment attestation layer.

See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) for the full spec.

## Status

Phase 1 (x402 resource server MVP) is code-complete; see DECISION_LOG.md
for what's verified vs. still blocked.

## Setup

```bash
npm install
cp .env.example .env   # already done if you're continuing this session
npm test               # runs the Base Sepolia integration test
npm run dev            # starts the server on $PORT (default 3402)
```

## Funding the testnet wallet

The server's `DEPLOYER_KEYSTORE_ACCOUNT` / `X402_PAY_TO_ADDRESS` wallet
needs Base Sepolia ETH (gas) and USDC before `npm test` can exercise a real
payment:

1. Get the address: `cast wallet address --account <DEPLOYER_KEYSTORE_ACCOUNT from .env>`
2. Claim ETH: [CDP Faucet](https://portal.cdp.coinbase.com/products/faucet) → Base Sepolia → ETH
3. Claim USDC: [Circle Faucet](https://faucet.circle.com/) → Base Sepolia → USDC
4. Verify: `cast balance <address> --rpc-url https://sepolia.base.org`
