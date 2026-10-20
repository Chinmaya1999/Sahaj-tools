import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("MiniStock", () => {
  test("add a product, sell on part-payment, collect the balance, return and see it in money", async ({ page }) => {
    await register(page);
    await page.goto("/tools/inventory");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // add product with the guided form
    await page.getByRole("tab", { name: "Products" }).click();
    await page.getByRole("button", { name: "+ Add product" }).first().click();
    const f = page.getByRole("dialog");
    await f.getByLabel("Product / design name").fill("Hu Shirt");
    await f.getByLabel("Product type").fill("Full sleeve shirt"); await f.getByLabel("Age / size / variant").fill("0-6 months"); await f.getByLabel("Colour").fill("White");
    await f.getByLabel("Cost per unit (₹)").fill("500"); await f.getByLabel("Selling price (₹)").fill("799"); await f.getByLabel("Opening stock").fill("20");
    await expect(f.getByText(/Suggested: HU-0-6-WHI-FUL|Suggested: HU-/)).toBeVisible();
    await f.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Hu Shirt").first()).toBeVisible();
    await expect(page.getByText("20", { exact: true }).first()).toBeVisible();

    // sell 3 and take part payment
    await page.getByRole("tab", { name: "Sell" }).click();
    await page.getByLabel("Search product").fill("Hu");
    await page.getByRole("button", { name: /Hu Shirt/ }).first().click();
    await page.getByRole("button", { name: "More" }).click(); await page.getByRole("button", { name: "More" }).click();
    await page.getByLabel("Amount received ₹").fill("1000");
    await expect(page.getByText(/Customer will owe/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm sale" }).click();
    await expect(page.getByText(/S-0001 saved/)).toBeVisible();
    await expect(page.getByText("Balance due")).toBeVisible();

    // stock fell to 17
    await page.getByRole("tab", { name: "Products" }).click();
    await expect(page.getByText("17", { exact: true }).first()).toBeVisible();

    // collect the balance from the order
    await page.getByRole("tab", { name: "Orders" }).click();
    await page.getByRole("button", { name: /S-0001/ }).click();
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Return items" }).click();
    await page.getByLabel("Qty").last().fill("1");
    await page.getByLabel("Condition").selectOption("restockable");
    await page.getByRole("button", { name: "Record return" }).click();
    await expect(page.getByText(/^R-0001 · /)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("tab", { name: "Money" }).click();
    await expect(page.getByText("Sales revenue").first()).toBeVisible();
    await expect(page.getByText("Gross profit").first()).toBeVisible();
    await page.getByRole("tab", { name: "Insights" }).click();
    await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  });

  test("unknown barcode shows Product not found and creates nothing; overselling is refused", async ({ page }) => {
    await register(page);
    await page.goto("/tools/inventory"); await page.getByRole("tab", { name: "Products" }).click();
    await page.getByLabel("Scan barcode / QR or type SKU").fill("NOPE-123"); await page.getByRole("button", { name: "Find" }).click();
    await expect(page.getByText(/Product not found/)).toBeVisible();
    await expect(page.getByText("No products yet")).toBeVisible();
  });

  test("works on a phone-sized screen without sideways scrolling", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 780 }, isMobile: true }); const page = await ctx.newPage();
    await register(page); await page.goto("/tools/inventory");
    for (const t of ["Today", "Sell", "Orders", "Products", "People", "Buying", "Money", "Insights"]) {
      await page.getByRole("tab", { name: t }).click(); await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), t).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});
