import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PASSWORD, email, login, register } from "./helpers";

test.describe("marketing & auth", () => {
  test("home page shows the brand promise, working demos and real prices", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everything you need to solve everyday problems.");
    await expect(page.getByRole("link", { name: "Explore Tools" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try Free Tools" })).toBeVisible();
    // invoice demo: 2 x ₹500 @ 18% = ₹1,180
    const demo = page.getByRole("tabpanel");
    await expect(demo.getByText("₹1,180.00")).toBeVisible();
    await demo.getByLabel("Qty").fill("3");
    await expect(demo.getByText("₹1,770.00")).toBeVisible();
    await page.getByRole("tab", { name: /QR/ }).click();
    await expect(page.getByRole("img", { name: "QR code preview" }).first()).toBeVisible();
    await expect(page.getByText("₹29").first()).toBeVisible();
    await expect(page.getByText(/testimonial|\d+,?\d* (happy )?customers/i)).toHaveCount(0); // no fabricated social proof
  });

  test("registration validation, duplicate email, login failure, logout", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("A");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters")).toBeVisible();
    const e = await register(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/register");
    await page.getByLabel("Name").fill("Again");
    await page.getByLabel("Email").fill(e);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/already exists/)).toBeVisible();
    await login(page, e, "wrong-password-1");
    await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
    await login(page, e);
    await expect(page.getByRole("heading", { name: /Hello, / })).toBeVisible();
  });

  test("protected pages redirect to sign-in; customers cannot open admin", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/login/);
    await register(page);
    await page.goto("/admin");
    await expect(page).toHaveURL("/");
    const r = await page.request.get("/api/admin/stats");
    expect(r.status()).toBe(403);
  });

  test("password reset request never reveals whether an email exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email());
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If that email is registered/)).toBeVisible();
    await page.goto("/reset-password?token=expired-or-invalid-token-value");
    await page.getByLabel("New password").fill("Brand-new-pass-9");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  });

  test("legal, help and contact pages work", async ({ page }) => {
    for (const [path, h] of [["/terms", "Terms of service"], ["/privacy", "Privacy policy"], ["/refunds", "Refund & cancellation policy"], ["/help", "Help centre"]] as const) {
      await page.goto(path); await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible();
    }
    await page.goto("/help");
    await page.getByRole("button", { name: /Are my PDFs and photos uploaded/ }).click();
    await expect(page.getByText(/never leave your device/i).first()).toBeVisible();
    await page.goto("/contact");
    await page.getByLabel("Name").fill("Asha"); await page.getByLabel("Email").fill(email()); await page.getByLabel("Subject").fill("Download problem");
    await page.getByLabel("Message").fill("My download did not open on my phone.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Message received")).toBeVisible();
  });
});

test.describe("accessibility", () => {
  for (const path of ["/", "/pricing", "/explore", "/login", "/register", "/help", "/tools/pdf-tools", "/tools/photo-tools", "/tools/qr-business", "/tools/invitation"]) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await page.goto(path); await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    });
  }
  test("keyboard: skip link and form errors are announced", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("responsive & motion", () => {
  test("mobile layout: no horizontal scroll, bottom tab bar works", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true });
    const page = await ctx.newPage();
    for (const path of ["/", "/pricing", "/tools/pdf-tools", "/tools/invitation"]) {
      await page.goto(path); await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
    await page.goto("/");
    await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/pricing/);
    await ctx.close();
  });
  test("reduced motion: content is visible immediately", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage(); await page.goto("/");
    await expect(page.getByRole("heading", { name: "Choose your problem" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("back button", () => {
  test("goes to the previous page, or home when the page was opened directly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0); // not on the home page
    await page.getByRole("link", { name: "Pricing" }).first().click();
    await expect(page).toHaveURL(/pricing/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL("http://localhost:5174/");
    await page.goto("/help");
    await page.getByRole("button", { name: "Back" }).click(); // no history: falls back to home
    await expect(page).toHaveURL("http://localhost:5174/");
  });
  test("is available inside tools and the account area", async ({ page }) => {
    await register(page);
    await page.goto("/account/settings");
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await page.goto("/tools/inventory"); await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  });
});
