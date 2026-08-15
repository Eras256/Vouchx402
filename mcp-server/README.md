# vouch402-mcp-server

A standalone [MCP](https://modelcontextprotocol.io) server for
[Vouch402](https://vouch402.fly.dev): lets any MCP-capable agent get a
live, paid, on-chain risk score for a Base address, with the
resulting attestation independently verified against EAS rather than
trusted from the API's own response.

## This server never holds a wallet or signs a transaction

That's a deliberate design decision, not an oversight, and it's the
main thing worth understanding before using this. A [Base MCP
plugin](../plugins/vouch402.md) can delegate payment to the *caller's*
already-connected wallet session. A standalone server launched fresh
via `npx` has no such session to delegate to, so it needs its own
answer: hold a key itself, or never touch one.

This project chose never touching one, for two reasons: it's the
pattern the Base MCP ecosystem's own documentation states directly and
repeatedly for exactly this situation ("The MCP server itself does not
sign or broadcast transactions", "Do not ask for or use a private
key"), and it's consistent with how the rest of this project already
works: `plugins/vouch402.md` makes the same non-custodial choice, and
the main server has never accepted a raw private key anywhere. Full
reasoning in [DECISION_LOG.md](../DECISION_LOG.md), "Phase 10 open
question: how should the standalone MCP server pay?"

**The tradeoff, stated plainly**: this server is only useful to a
caller that already has its own way to sign and submit an on-chain
USDC transfer. If your MCP client has no wallet tooling at all, this
server can't pay on your behalf, by design; use the
[CLI](../cli) instead, which does hold a (keystore-encrypted, never
raw) key for exactly that single-user, run-it-yourself case.

## Tools

- **`get_payment_quote(address, baseUrl?)`**: returns the unsigned x402
  payment requirements for scoring `address` (amount, asset, `payTo`,
  network). Pay it yourself, with your own wallet.
- **`fetch_risk_score(address, quote, txHash, payer, baseUrl?, makePublic?)`**:
  takes the quote you got back and the transaction hash of your
  payment, retries until the server confirms it, then independently
  resolves the resulting attestation against EAS directly (not the
  API's own claim) before returning the score. `makePublic` (default
  `false`) opts this specific result into Vouch402's public activity
  feed (address, score, and signals shown in full); otherwise the
  result stays attestation-only, same as before this option existed.

## Usage

Add to your MCP client's config (`.mcp.json` for Claude Code, or the
equivalent for your client):

```json
{
  "mcpServers": {
    "vouch402": {
      "command": "npx",
      "args": ["-y", "vouch402-mcp-server"]
    }
  }
}
```

Then, from the agent side: call `get_payment_quote`, pay the quoted
amount using whatever wallet capability your own session has, then
call `fetch_risk_score` with the resulting transaction hash.

## Development

```bash
npm install   # resolves vouch402-sdk from ../sdk
npm run build
npm test      # spins up a local server + a real MCP client, Base Sepolia, real payment
```

## License

MIT. See [LICENSE](../LICENSE).
