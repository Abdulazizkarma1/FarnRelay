import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { ensureIndexes } from "./models.js";
const config = loadConfig();
await mongoose.connect(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 20,
});
await ensureIndexes();
const server = createApp(config).listen(config.PORT, "0.0.0.0", () =>
  console.info(`FarmRelay API listening on port ${config.PORT}`),
);
server.requestTimeout = 60000;
server.headersTimeout = 15000;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const hard = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    await mongoose.disconnect();
    clearTimeout(hard);
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
