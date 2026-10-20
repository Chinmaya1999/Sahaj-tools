import { expect, test, type Page } from "@playwright/test";
import { register } from "./helpers";

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) problems.push(`http ${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api/, "/api")}`); });
  return problems;
}

test("every public page and tool loads with no console errors or failed requests", async ({ page }) => {
  const problems = watch(page);
  for (const p of ["/", "/explore", "/free-tools", "/pricing", "/bundles", "/help", "/contact", "/terms", "/privacy", "/refunds", "/login", "/register", "/forgot-password",
    ...["invoice", "resume", "inventory", "invitation", "pdf-tools", "qr-business", "photo-tools"].flatMap((s) => [`/tools/${s}/about`, `/tools/${s}`])]) {
    await page.goto(p); await page.waitForLoadState("networkidle");
  }
  // /tools/invoice etc. for anonymous users legitimately show a sign-in prompt, no API errors expected
  expect(problems.filter((x) => !x.includes("/api/auth/me"))).toEqual([]);
});

test("every signed-in screen loads cleanly for a brand-new user", async ({ page }) => {
  await register(page);
  const problems = watch(page);
  for (const p of ["/account", "/account/orders", "/account/library", "/account/downloads", "/account/settings", "/tools/invoice", "/tools/resume", "/tools/inventory", "/tools/qr-business", "/tools/invitation", "/checkout/plan/invoice-pro", "/checkout/bundle/bundle-shop"]) {
    await page.goto(p); await page.waitForLoadState("networkidle");
  }
  await page.goto("/tools/inventory"); for (const t of ["Items", "Movements", "Reports", "Import / export", "Dashboard"]) { await page.getByRole("tab", { name: t }).click(); await page.waitForLoadState("networkidle"); }
  await page.goto("/tools/qr-business"); await page.getByRole("tab", { name: "Mini-business page" }).click(); await page.waitForLoadState("networkidle");
  expect(problems.filter((x) => !x.includes("http 412"))).toEqual([]); // 412 = "set up business first" is a handled state
});
