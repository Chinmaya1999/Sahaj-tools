import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // dummy value so the real .env (Atlas) is never used by tests; the in-memory server URI is injected in setup.ts
      MONGODB_URI: "mongodb://127.0.0.1:1/never-used",
      SESSION_SECRET: "test-session-secret-0123456789abcdef0123",
      DOWNLOAD_SECRET: "test-download-secret-0123456789abcdef01",
      SANDBOX_PAYMENT_SECRET: "test-sandbox-payment-secret-0123456789",
      PAYMENT_PROVIDER: "sandbox",
      WEB_ORIGIN: "http://localhost:5173",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "Admin-Test-Pass-1",
      LLM_PROVIDER: "none",
    },
  },
});
