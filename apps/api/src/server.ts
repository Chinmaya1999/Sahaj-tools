import { createApp } from "./app.js";
import { ensureAdmin } from "./bootstrap.js";
import { connectDb } from "./db.js";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";

await connectDb();
await ensureAdmin();
const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV}, payments: ${env.PAYMENT_PROVIDER})`));
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
