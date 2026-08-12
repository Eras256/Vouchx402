import { createApp } from "./app";
import { env } from "../lib/env";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Vouch402 listening on :${env.port} (network=${env.network})`);
});
