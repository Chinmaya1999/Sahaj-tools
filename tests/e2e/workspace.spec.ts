import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("signed-in workspace", () => {
  test("shows the app workspace instead of the marketing site, with search, quick-create and sign out", async ({ page }) => {
    await register(page);
    // the public home page is skipped, sign-in/up pages too
    await page.goto("/"); await expect(page).toHaveURL(/\/account$/);
    await page.goto("/login"); await expect(page).toHaveURL(/\/account$/);
    // sidebar with every tool and account page; no marketing navigation
    const side = page.getByRole("navigation", { name: "Workspace" });
    for (const t of ["Dashboard", "Invoices & quotes", "Stock & sales", "QR & business page", "Resume builder", "Invitations", "PDF tools", "Photo resize", "Orders & receipts", "Software library", "Settings", "Plans & pricing"]) await expect(side.getByRole("link", { name: t })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    // dashboard launchpad
    await expect(page.getByRole("heading", { name: "All your tools" })).toBeVisible();
    // command palette: Ctrl/Cmd+K, type, Enter
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: /Search tools/ }).fill("resume");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tools\/resume/);
    // quick create jumps straight into the right tab
    await page.getByRole("button", { name: /New/ }).first().click();
    await page.getByRole("menuitem", { name: "Make a sale" }).click();
    await expect(page).toHaveURL(/tools\/inventory\?tab=sell/);
    await expect(page.getByRole("tab", { name: "Sell", selected: true })).toBeVisible();
    // collapse remembers state, sign out returns to the public site
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  test("on a phone: top bar, drawer menu and bottom tabs, no sideways scroll", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true }); const page = await ctx.newPage();
    await register(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const tabs = page.getByRole("navigation", { name: "Quick tabs" });
    await expect(tabs.getByRole("link", { name: "Invoices" })).toBeVisible();
    await tabs.getByRole("button", { name: "More" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer.getByRole("link", { name: "Resume builder" })).toBeVisible();
    await drawer.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/account\/settings/); await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    await ctx.close();
  });
});
