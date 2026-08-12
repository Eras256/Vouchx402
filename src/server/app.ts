import express, { type Express } from "express";
import { isAddress, formatUnits } from "viem";
import { defaultNetwork } from "../lib/chain";
import { computeRiskScore } from "../scoring/score";
import { issueQuote, decodePaymentHeader } from "./x402";
import { verifyPayment, PaymentVerificationError } from "./payment";
import { recordRequestServed, getMetrics } from "../lib/db";
import { attestFulfillment, FulfillmentStatus } from "../attestation/middleware";
import { submitDispute, DisputeError, DisputeReasonCode } from "../attestation/dispute";

export function createApp(): Express {
  const app = express();
  // Fly (and most PaaS) terminate TLS at the edge and forward plain HTTP
  // internally — without this, req.protocol always reads "http", so the
  // `resource` field in the 402 body would claim an insecure URL even
  // when the actual request came in over HTTPS. Confirmed live on the
  // Fly deployment before this was added — not a hypothetical.
  app.set("trust proxy", true);
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "Vouch402",
      description: "x402-metered on-chain risk intelligence for autonomous agents on Base, with a proof-of-fulfillment attestation layer (x402-SAP).",
      endpoints: {
        "GET /v1/risk-score/:address": "x402-gated risk score",
        "GET /v1/metrics": "public aggregate metrics",
        "POST /v1/disputes": "file a dispute against a fulfillment attestation",
      },
    });
  });

  app.get("/v1/risk-score/:address", async (req, res) => {
    const { address } = req.params;
    if (!isAddress(address)) {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const network = defaultNetwork();
    const resourcePath = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    const paymentHeader = req.header("X-PAYMENT");
    if (!paymentHeader) {
      const requirements = issueQuote(network, address, resourcePath);
      res.status(402).json(requirements);
      return;
    }

    let verified;
    try {
      const proof = decodePaymentHeader(paymentHeader);
      verified = await verifyPayment(network, proof);

      if (verified.address.toLowerCase() !== address.toLowerCase()) {
        res.status(400).json({ error: "Payment resourceId does not match the requested address" });
        return;
      }
    } catch (err) {
      if (err instanceof PaymentVerificationError) {
        res.status(402).json({ error: err.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Internal error" });
      return;
    }

    // Payment is verified and consumed from here on — every remaining
    // failure path still owes the payer an honest, on-chain record of
    // what happened (docs/TECHNICAL_SPEC.md: "including of our own
    // failures"), since there's no way to "un-charge" them at this point.
    // That record is what the dispute flow exists to be checked against.
    try {
      const { score, signals } = await computeRiskScore(network, address);
      const responsePayload = { address, score, signals };

      const { uid: attestationUid } = await attestFulfillment({
        network,
        payer: verified.payer,
        payee: verified.payTo,
        x402PaymentRef: verified.txHash,
        resourceId: verified.resourceId,
        status: FulfillmentStatus.Fulfilled,
        responsePayload,
      });

      recordRequestServed({
        resourceId: verified.resourceId,
        address: address.toLowerCase(),
        payer: verified.payer,
        txHash: verified.txHash,
        score,
      });

      res.status(200).json({ ...responsePayload, attestationUid });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Fulfillment failed after payment was verified:", err);
      try {
        await attestFulfillment({
          network,
          payer: verified.payer,
          payee: verified.payTo,
          x402PaymentRef: verified.txHash,
          resourceId: verified.resourceId,
          status: FulfillmentStatus.Error,
          responsePayload: { error: "Internal error" },
        });
      } catch (attestErr) {
        // eslint-disable-next-line no-console
        console.error("Additionally failed to record the error attestation:", attestErr);
      }
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/v1/metrics", (_req, res) => {
    const m = getMetrics();
    res.status(200).json({
      uniquePayers: m.uniquePayers,
      totalRequestsServed: m.totalRequestsServed,
      totalVolumeUsdc: formatUnits(BigInt(m.totalVolumeAtomic), 6),
      attestationCount: m.attestationCount,
      disputeCount: m.disputeCount,
    });
  });

  app.post("/v1/disputes", async (req, res) => {
    const { refUID, reasonCode, details, signature } = req.body ?? {};
    if (
      typeof refUID !== "string" ||
      typeof reasonCode !== "number" ||
      typeof details !== "string" ||
      typeof signature !== "string"
    ) {
      res.status(400).json({ error: "Expected { refUID, reasonCode, details, signature }" });
      return;
    }
    if (!(reasonCode in DisputeReasonCode)) {
      res.status(400).json({ error: `Invalid reasonCode: ${reasonCode}` });
      return;
    }

    try {
      const { uid, disputant } = await submitDispute({
        network: defaultNetwork(),
        refUID,
        reasonCode,
        details,
        signature: signature as `0x${string}`,
      });
      res.status(200).json({ disputeUid: uid, disputant });
    } catch (err) {
      if (err instanceof DisputeError) {
        res.status(400).json({ error: err.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return app;
}
