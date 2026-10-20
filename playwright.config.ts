import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure", screenshot: "only-on-failure", acceptDownloads: true },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "npx tsx apps/api/src/scripts/e2e-server.ts", url: "http://localhost:4010/api/health", reuseExistingServer: false, timeout: 120_000, env: { PORT: "4010", WEB_ORIGIN: "http://localhost:5174" } },
    { command: "npx vite --port 5174 --strictPort", cwd: "apps/web", url: "http://localhost:5174", reuseExistingServer: false, timeout: 60_000, env: { API_URL: "http://localhost:4010" } },
  ],
});
