import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { register } from "./helpers";

test.describe("app welcome page and phone safe areas", () => {
  test("welcome page: animated scene, clear actions, accessible, signed-in users skip it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // also proves the page is complete without animation, and keeps the scan deterministic
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your whole business");
    await expect(page.locator("canvas").first()).toBeVisible(); // the 3D hologram scene
    await expect(page.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/register");
    await expect(page.getByRole("link", { name: "I already have an account" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0); // full-screen landing, no website menu
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message ?? "")).join(" | "))).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    const axeLight = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axeLight.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.getByRole("link", { name: "I already have an account" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await register(page);                                  // signed in now
    await page.goto("/welcome"); await expect(page).toHaveURL(/\/account$/);
  });

  test("on a phone with a notch/status bar the top bar and tab bar stay clear of the system areas", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await register(page); await page.getByRole("heading", { name: /Hello, / }).waitFor();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 48, bottom: 34, left: 0, right: 0 } }); // a typical status bar + gesture bar
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const header = document.querySelector("header.sticky")!.getBoundingClientRect();
      const row = document.querySelector("header.sticky > div")!.getBoundingClientRect();
      const button = document.querySelector("header.sticky button")!.getBoundingClientRect();
      const tabs = document.querySelector("nav.tab-bar")!.getBoundingClientRect();
      return { headerH: header.height, rowTop: row.top, rowH: row.height, buttonTop: button.top, tabsBottom: tabs.bottom, vh: innerHeight };
    });
    expect(m.rowTop, "the top bar's content starts below the status bar").toBeGreaterThanOrEqual(47);
    expect(m.rowH, "the top bar row keeps its full height").toBeGreaterThanOrEqual(55);
    expect(m.buttonTop).toBeGreaterThanOrEqual(47);
    expect(m.tabsBottom, "the tab bar sits above the gesture bar").toBeLessThanOrEqual(m.vh - 34);
    await ctx.close();
  });
});

test("brand: Oqzra name, icons, manifest and search tags on public pages", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Oqzra/);
  for (const href of ["/favicon.ico", "/favicon-32.png", "/apple-touch-icon.png", "/manifest.webmanifest", "/og-image.png", "/icon-512.png"]) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
  await page.goto("/download");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Oqzra");
  await expect(page.locator("a[data-download=android]")).toHaveAttribute("href", /Oqzra\.apk$/);
});
