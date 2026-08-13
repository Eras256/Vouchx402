# vouch402

CLI for [Vouch402](https://vouch402.fly.dev): pay for and fetch a live
on-chain risk score for a Base address, with the resulting attestation
independently verified against EAS, not just trusted from the API's
own response. A thin wrapper over [`vouch402-sdk`](../sdk): the CLI
does argument parsing, key loading, and output formatting; all of the
actual quote/pay/fetch/verify logic lives in the SDK.

This is an evaluation tool for checking a single address from the
terminal, not a product surface on its own.

## Install

```bash
npm install -g vouch402
```

## Usage

```bash
vouch402 score 0x53a79B109fa77c05B043e73A284a22b57c6263b0
```

Prints the score, signals, payment transaction hash, attestation UID,
and an EAS explorer link once the flow completes.

### Wallet

The command needs a funded wallet to pay for the quote. Rather than
accepting a raw private key (this project doesn't do that anywhere),
it decrypts a standard Foundry keystore, the same file `cast wallet
new`/`cast wallet import` writes:

```bash
export VOUCH402_KEYSTORE_ACCOUNT=my-wallet
export VOUCH402_KEYSTORE_PASSWORD=...
vouch402 score 0x53a79B109fa77c05B043e73A284a22b57c6263b0
```

`VOUCH402_KEYSTORE_ACCOUNT` names a keystore under
`~/.foundry/keystores/`. If you don't already have one:

```bash
cast wallet new my-wallet
```

Alternatively, `VOUCH402_KEYSTORE_JSON` accepts the keystore file's
contents inline, useful in environments without a local
`~/.foundry/keystores/` directory.

### Pointing at a different server

```bash
vouch402 score <address> --base-url https://your-instance.example
```

Defaults to the live Vouch402 instance (`https://vouch402.fly.dev`,
Base mainnet).

## Development

```bash
npm install   # resolves vouch402-sdk from ../sdk
npm run build
node dist/index.js score <address> --base-url http://127.0.0.1:3402
```

## License

MIT. See [LICENSE](../LICENSE).
