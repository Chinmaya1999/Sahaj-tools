// Starts the API on an isolated in-memory MongoDB for browser end-to-end tests. Never touches a real database.
import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri("ek_e2e");
process.env.NODE_ENV = "development";
process.env.PORT = process.env.PORT ?? "4010";
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5174";
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.ADMIN_EMAIL = "admin@e2e.local";
process.env.ADMIN_PASSWORD = "E2E-Admin-Pass-1";
process.env.LLM_PROVIDER = "none";
// Throwaway secrets so the suite runs where there is no .env (CI). Never used outside this in-memory test server.
process.env.SESSION_SECRET ??= "e2e-only-session-secret-0123456789abcdef";
process.env.DOWNLOAD_SECRET ??= "e2e-only-download-secret-0123456789abcd";
process.env.SIGNUP_LIMIT_PER_HOUR = "500"; // the browser suite registers many throwaway accounts from one address
await import("../server.js");
process.on("SIGTERM", async () => { await mongod.stop(); process.exit(0); });
