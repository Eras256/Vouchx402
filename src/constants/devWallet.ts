/**
 * The team's own deployer/payTo wallet (see builderCode.ts,
 * DECISION_LOG.md), used for all real testing this project has ever
 * done. Its scored results are shown in full on the public activity
 * feed by default: it's the team's own address, nothing to protect.
 * Everyone else's results stay attestation-only unless they opt in
 * (see the `makePublic` field on the X-PAYMENT payload). See
 * DECISION_LOG.md for the full reasoning.
 */
export const DEV_WALLET_ADDRESS = "0x53a79B109fa77c05B043e73A284a22b57c6263b0";
