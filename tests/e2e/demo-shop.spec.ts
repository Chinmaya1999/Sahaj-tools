import { expect, test, type Page } from "@playwright/test";
import { register } from "./helpers";

/** Demo shop driven through the real screens (not the API): people, buying, shipping, money, stock count, reports. */
const api = (page: Page, path: string, body: unknown) => page.request.post(`/api${path}`, { data: body, headers: { "X-Requested-With": "ek" } });

test("demo shop: customers, suppliers, purchase order → receive → pay, ship an order, expenses, close the day, stock count, reports", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page);
  const prod = await (await api(page, "/ministock/products", { name: "Hu Shirt", ageGroup: "0-6 months", colour: "White", productType: "Full sleeve shirt", sku: "HU-06M-WHI", costPaise: 50000, pricePaise: 79900, openingQty: 20, reorderLevel: 5 })).json();
  expect(prod.product.onHand).toBe(20);
  await page.goto("/tools/inventory");

  /* People */
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByRole("button", { name: "+ Add customer" }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill("Ravi Kumar"); await dlg.getByLabel("Phone").fill("9876543210"); await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ravi Kumar")).toBeVisible();
  await page.getByRole("button", { name: "suppliers" }).click();
  await page.getByRole("button", { name: "+ Add supplier" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name", { exact: true }).fill("Fab Co"); await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Fab Co/).first()).toBeVisible();

  /* Buying: a purchase order does not change stock; receiving does */
  await page.getByRole("tab", { name: "Buying" }).click();
  await page.getByRole("button", { name: "+ Purchase order" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Add product").selectOption({ label: "Hu Shirt · HU-06M-WHI" });
  await dlg.getByLabel("Qty").fill("30"); await dlg.getByLabel("Cost ₹").fill("560");
  await expect(dlg.getByText("Total ₹16,800")).toBeVisible();
  await dlg.getByRole("button", { name: "Create purchase order" }).click();
  await page.getByRole("button", { name: /PO-0001/ }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Receive goods" }).click();
  await dlg.getByLabel("Accepted").fill("28"); await dlg.getByLabel("Rejected").fill("2");
  await dlg.getByRole("button", { name: "Add to stock" }).click();
  await expect(dlg.getByText(/accepted 28/)).toBeVisible();
  await dlg.getByRole("button", { name: "Pay supplier" }).click();
  await dlg.getByLabel("Amount ₹").fill("10000"); await dlg.getByRole("button", { name: "Record payment" }).click();
  await expect(dlg.getByText(/paid ₹10,000/)).toBeVisible();
  await dlg.getByRole("button", { name: "Close" }).click();

  /* Products reflect only the accepted units: 20 + 28 = 48 */
  await page.getByRole("tab", { name: "Products" }).click();
  await expect(page.getByText("48", { exact: true }).first()).toBeVisible();

  /* An online order goes through the whole fulfilment flow on screen */
  const o = await (await api(page, "/ministock/orders", { fulfilment: "later", channel: "whatsapp", lines: [{ itemId: prod.product.id, quantity: 4 }], shippingPaise: 5000, payments: [{ method: "upi", amountPaise: 100000, reference: "UPI-DEMO" }] })).json();
  expect(o.order.status).toBe("confirmed");
  await page.getByRole("tab", { name: "Orders" }).click();
  await page.getByRole("button", { name: /S-0001/ }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Pack" }).click();
  await dlg.getByLabel("Scan item").fill("HU-06M-WHI");
  await dlg.getByRole("button", { name: "Add", exact: true }).click();
  await dlg.getByRole("button", { name: "Verify and mark packed" }).click(); // only 1 of 4 scanned → refused
  await expect(dlg.getByText("Scans do not match this order")).toBeVisible();
  await dlg.getByRole("button", { name: "clear" }).click();
  await dlg.getByRole("button", { name: "Mark packed without scanning" }).click();
  await dlg.getByRole("button", { name: "Dispatch" }).click();
  await dlg.getByLabel("Courier").fill("DTDC"); await dlg.getByLabel("Tracking number").fill("D12345");
  await dlg.getByRole("button", { name: "Dispatch order" }).click();
  await dlg.getByRole("button", { name: "Mark delivered" }).click();
  await expect(dlg.getByText("delivered").first()).toBeVisible();
  await dlg.getByRole("button", { name: "Record payment" }).click(); // balance after the UPI advance
  await dlg.getByRole("button", { name: "Save payment" }).click();
  await expect(dlg.getByText("Owes you")).toBeVisible();
  await dlg.getByRole("button", { name: "Close" }).click();

  /* Money: expense, then close the day (cash) */
  await page.getByRole("tab", { name: "Money" }).click();
  await page.getByRole("button", { name: "+ Add expense" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Category", { exact: true }).selectOption("Packaging"); await dlg.getByLabel("Amount ₹").fill("120"); await dlg.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Packaging").first()).toBeVisible();
  await expect(page.getByText("Sales revenue").first()).toBeVisible();
  await page.getByRole("button", { name: "Close the day" }).click();
  dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Expected in the drawer")).toBeVisible();
  await dlg.getByLabel("Cash actually counted ₹").fill("1");
  await expect(dlg.getByText(/Short by/)).toBeVisible();
  await dlg.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  /* Stock count: review differences, then post */
  await page.getByRole("tab", { name: "Products" }).click();
  await page.getByRole("button", { name: "Count stock" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByLabel("Counted Hu Shirt").fill("43");
  await dlg.getByRole("button", { name: "Review differences" }).click();
  await expect(dlg.getByText("(-1)")).toBeVisible(); // 48 - 4 sold = 44 expected, counted 43
  await dlg.getByRole("button", { name: "Confirm and post" }).click();
  await expect(page.getByText("43", { exact: true }).first()).toBeVisible();

  /* Insights: every report renders for the demo data */
  await page.getByRole("tab", { name: "Insights" }).click();
  for (const label of ["Daily sales", "Product performance", "Stock valuation", "Customer dues", "Supplier dues", "Expenses", "Returns & refunds", "Inventory movement"]) {
    await page.getByLabel("Report", { exact: true }).selectOption({ label });
    await expect(page.getByText(/Download CSV/)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Something went wrong");
  }
  await page.getByLabel("Report", { exact: true }).selectOption({ label: "Stock valuation" });
  await expect(page.getByRole("cell", { name: "HU-06M-WHI" })).toBeVisible();
});
