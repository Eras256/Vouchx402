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
vouch402 score 0x53a79B109fa77c05B043e73A284a22b57c6263b0 --attest-jurisdiction
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
vouch402 score 0x53a79B109fa77c05B043e73A284a22b57c6263b0 --attest-jurisdiction
```

`VOUCH402_KEYSTORE_ACCOUNT` names a keystore under
`~/.foundry/keystores/`. If you don't already have one:

```bash
cast wallet new ~/.foundry/keystores my-wallet
```

(Not `cast wallet new my-wallet` alone — `cast wallet new` takes
`[PATH] [ACCOUNT_NAME]`, and a single bare argument binds to `PATH`,
not the account name, so that shorter form fails with "my-wallet is
not a directory." Verified directly against `cast 1.7.1`; see
`DECISION_LOG.md`.)

Alternatively, `VOUCH402_KEYSTORE_JSON` accepts the keystore file's
contents inline, useful in environments without a local
`~/.foundry/keystores/` directory.

### Jurisdiction attestation (required)

```bash
vouch402 score <address> --attest-jurisdiction
```

Required on every call: the API rejects the request outright without
it. Certifies that you are not located in, and are not paying on
behalf of anyone in, Cuba, Iran, North Korea, Syria, the Russian-
occupied regions of Ukraine, or mainland China. See the "Restricted
Jurisdictions" section at [vouch402.xyz/legal](https://www.vouch402.xyz/legal)
for the legal basis behind each entry. This is the CLI's equivalent of
the checkbox on the website's own "Try It" demo; there's no
interactive prompt here on purpose, since this command also gets run
non-interactively/by scripts.

### Pointing at a different server

```bash
vouch402 score <address> --attest-jurisdiction --base-url https://your-instance.example
```

Defaults to the live Vouch402 instance (`https://vouch402.fly.dev`,
Base mainnet).

### Making a result public

```bash
vouch402 score <address> --attest-jurisdiction --public
```

By default, a scored result is attestation-only on Vouch402's public
activity feed: no address, score, or signals shown, only that a
fulfillment happened. `--public` opts this specific result into being
shown in full. Off unless you ask for it.

## Development

```bash
npm install   # resolves vouch402-sdk from ../sdk
npm run build
node dist/index.js score <address> --attest-jurisdiction --base-url http://127.0.0.1:3402
```

## License

MIT. See [LICENSE](../LICENSE).
