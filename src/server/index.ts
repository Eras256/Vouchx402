import { createApp } from "./app";
import { env } from "../lib/env";

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Vouch402 listening on :${env.port} (network=${env.network})`);
});

/**
 * Fly (and most PaaS) send SIGINT/SIGTERM on any auto-stop: scale-to-zero
 * idling included, not just a real deploy/restart. Node's default
 * handling for those signals is an immediate process exit, which can cut
 * off a request mid-fulfillment: payment already verified and marked
 * processed, but the attestation/response never completes and the caller
 * gets nothing. Observed exactly this on the live Fly deployment (a
 * request killed mid-flight left a processed payment with no matching
 * fulfillment attestation), not hypothetical. Draining in-flight
 * requests before exiting is the fix; new connections stop being
 * accepted immediately, but work already underway gets to finish.
 */
function gracefulShutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, draining in-flight requests before exit`);
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log("All connections drained, exiting.");
    process.exit(0);
  });
  // Don't hang forever if something never resolves.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error("Drain timed out after 25s, forcing exit.");
    process.exit(1);
  }, 25_000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
