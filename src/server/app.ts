import express, { type Express } from "express";
import { isAddress } from "viem";
import { defaultNetwork } from "../lib/chain";
import { computeRiskScore } from "../scoring/score";
import { issueQuote, decodePaymentHeader } from "./x402";
import { verifyPayment, PaymentVerificationError } from "./payment";
import { recordRequestServed } from "../lib/db";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

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

    try {
      const proof = decodePaymentHeader(paymentHeader);
      const verified = await verifyPayment(network, proof);

      if (verified.address.toLowerCase() !== address.toLowerCase()) {
        res.status(400).json({ error: "Payment resourceId does not match the requested address" });
        return;
      }

      const { score, signals } = await computeRiskScore(network, address);

      recordRequestServed({
        resourceId: verified.resourceId,
        address: address.toLowerCase(),
        payer: verified.payer,
        txHash: verified.txHash,
        score,
      });

      res.status(200).json({
        address,
        score,
        signals,
        // Populated once the Phase 2 attestation layer wraps this handler.
        attestationUid: null,
      });
    } catch (err) {
      if (err instanceof PaymentVerificationError) {
        res.status(402).json({ error: err.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return app;
}
