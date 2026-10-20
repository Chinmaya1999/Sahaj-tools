import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { buy, makePdf, makePng, register } from "./helpers";

test.describe("billing & downloads", () => {
  test("buy Inventory Pro in the sandbox, then download a valid starter kit", async ({ page }) => {
    await register(page);
    await page.goto("/account/library");
    await expect(page.getByText(/Included with/)).toBeVisible(); // locked before purchase
    await buy(page, "/checkout/plan/inventory-pro");
    await expect(page.getByText(/EK-\d{4}-/).first()).toBeVisible();
    await page.goto("/account/library");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download inventory-starter-kit/ }).click()]);
    const zip = await JSZip.loadAsync(fs.readFileSync((await dl.path())!));
    expect(Object.keys(zip.files)).toContain("README.txt");
    await page.goto("/account/downloads");
    await expect(page.getByText("downloaded").first()).toBeVisible();
    await page.goto("/account");
    await expect(page.getByText("500").first()).toBeVisible(); // limit raised by the entitlement
  });

  test("failed and cancelled sandbox payments grant nothing and can be retried", async ({ page }) => {
    await register(page);
    await page.goto("/checkout/plan/pdf-batch");
    await page.getByRole("button", { name: /^Pay / }).click();
    await page.getByRole("button", { name: "Simulate failure" }).click();
    await expect(page.getByRole("heading", { name: "Payment did not go through" })).toBeVisible();
    await page.getByRole("link", { name: "Try again" }).click();
    await page.getByRole("button", { name: /^Pay / }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Checkout cancelled" })).toBeVisible();
    await page.goto("/account"); await expect(page.getByText("Max file (MB)").first()).toBeVisible();
    await expect(page.getByText("100")).toHaveCount(0);
  });
});

test.describe("invoices", () => {
  test("business setup → invoice with correct tax → PDF → quotation conversion → quota", async ({ page }) => {
    await register(page);
    await page.goto("/tools/invoice");
    await page.getByLabel("Business name").fill("Sharma Electricals");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "+ New invoice" }).click();
    await page.getByLabel("Customer name").fill("Ravi Kumar");
    await page.getByLabel("Description 1").fill("Wiring work");
    await page.getByLabel("Qty").fill("2"); await page.getByLabel("Rate ₹").fill("500"); await page.getByLabel("Tax %").fill("18");
    await expect(page.getByText("₹1,180.00").first()).toBeVisible();
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("# INV-0001")).toBeVisible();
    await expect(page.getByText("unpaid").first()).toBeVisible();
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    const bytes = fs.readFileSync((await pdf.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    await page.getByLabel("Record a payment ₹").fill("1180"); await page.getByRole("button", { name: "Add payment" }).click();
    await expect(page.getByText("paid", { exact: true }).first()).toBeVisible();
    // quotation -> accept -> convert (this is the 2nd document of the month)
    await page.getByRole("button", { name: "← All documents" }).click();
    await page.getByRole("tab", { name: "Quotations" }).click();
    await page.getByRole("button", { name: "+ New quotation" }).click();
    await page.getByLabel("Customer name").fill("Meera"); await page.getByLabel("Description 1").fill("Fan install"); await page.getByLabel("Rate ₹").fill("300");
    await page.getByRole("button", { name: "Create quotation" }).click();
    await expect(page.getByText("# QT-0001")).toBeVisible();
    await page.getByRole("button", { name: "Mark accepted" }).click();
    // the free plan allows 2 documents per month, so converting (a 3rd document) must ask to upgrade
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await expect(page.getByText(/free documents|Starter pack/i).first()).toBeVisible();
    await buy(page, "/checkout/plan/invoice-starter");
    await page.goto("/tools/invoice"); await page.getByRole("tab", { name: "Quotations" }).click();
    await page.getByRole("button", { name: "QT-0001" }).click();
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await expect(page.getByText("Converted to invoice").or(page.getByText("# INV-0002"))).toBeVisible();
  });
});

test.describe("inventory", () => {
  test("product, stock movements, insufficient stock, low stock, CSV import preview", async ({ page }) => {
    await register(page);
    await page.goto("/tools/inventory");
    await page.getByRole("tab", { name: "Items" }).click();
    await page.getByRole("button", { name: "+ New product" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Name").fill("Aloe Face Wash"); await dlg.getByLabel("SKU").fill("FW-1");
    await dlg.getByLabel("Selling price ₹").fill("180"); await dlg.getByLabel("Cost price ₹").fill("110"); await dlg.getByLabel("Opening stock").fill("6"); await dlg.getByLabel("Reorder level").fill("5");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "FW-1" })).toBeVisible();
    await page.getByRole("button", { name: "Update stock" }).click();
    await page.getByRole("dialog").getByLabel("Quantity").fill("10"); await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("Not enough stock – only 6 on hand.")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Quantity").fill("2"); await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("cell", { name: /^4/ })).toBeVisible();
    await expect(page.getByText("low", { exact: true })).toBeVisible();
    // duplicate SKU
    await page.getByRole("button", { name: "+ New product" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("Other"); await page.getByRole("dialog").getByLabel("SKU").fill("FW-1"); await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/already exists/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("tab", { name: "Movements" }).click();
    await expect(page.getByRole("cell", { name: "opening", exact: true })).toBeVisible();
    // CSV import with a bad row
    await page.getByRole("tab", { name: "Import / export" }).click();
    await page.getByLabel("Choose a CSV file").setInputFiles({ name: "p.csv", mimeType: "text/csv", buffer: Buffer.from("name,sku,price,quantity,expiry_date\nGood,G1,50,5,2027-01-01\nBadDate,G2,50,5,01/01/2027\nDup,FW-1,1,1,\n") });
    await page.getByRole("button", { name: "2. Check file (preview)" }).click();
    await expect(page.getByText(/1 ready/)).toBeVisible();
    await expect(page.getByText("expiry_date must be YYYY-MM-DD")).toBeVisible();
    await expect(page.getByText("SKU already exists – skipped")).toBeVisible();
    await page.getByRole("button", { name: /3\. Import 1 product/ }).click();
    await expect(page.getByText(/1 imported/)).toBeVisible();
  });
});

test.describe("browser-side tools", () => {
  test("PDF tools: merge, split, reject bad files", async ({ page }) => {
    await page.goto("/tools/pdf-tools");
    await page.getByLabel("Add PDFs").setInputFiles([{ name: "a.pdf", mimeType: "application/pdf", buffer: await makePdf(2) }, { name: "b.pdf", mimeType: "application/pdf", buffer: await makePdf(3) }]);
    await expect(page.getByText("2 page(s)")).toBeVisible();
    await page.getByRole("button", { name: "Run" }).click();
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    expect((await PDFDocument.load(fs.readFileSync((await d.path())!))).getPageCount()).toBe(5);
    // rejects non-PDF content disguised as .pdf, and corrupted PDFs
    await page.getByLabel("Add PDFs").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf at all") });
    await expect(page.getByText(/not a PDF file/)).toBeVisible();
    await page.getByLabel("Add PDFs").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\ngarbage that is not a real document") });
    await expect(page.getByText(/could not be read/)).toBeVisible();
    // split into ranges -> ZIP
    await page.getByRole("tab", { name: "Split / extract" }).click();
    await page.getByLabel("Add a PDF").setInputFiles({ name: "c.pdf", mimeType: "application/pdf", buffer: await makePdf(6) });
    await page.getByLabel(/Pages \(document has 6\)/).fill("1-2, 5");
    await page.getByLabel("Split into parts (one PDF per range, ZIP)").check();
    await page.getByRole("button", { name: "Run" }).click();
    const [z] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download all as ZIP" }).click()]);
    const zip = await JSZip.loadAsync(fs.readFileSync((await z.path())!));
    const pages = await Promise.all(Object.values(zip.files).map(async (f) => (await PDFDocument.load(await f.async("uint8array"))).getPageCount()));
    expect(pages.sort()).toEqual([1, 2]);
    await page.getByLabel(/Pages \(document has 6\)/).fill("9");
    await page.getByLabel("Split into parts (one PDF per range, ZIP)").check();
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "outside this document" })).toBeVisible();
  });

  test("Photo tools: preset resize meets size and dimension limits; explains impossible targets", async ({ page }) => {
    await page.goto("/tools/photo-tools");
    await page.getByLabel("Add a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: makePng(900, 1200) });
    await page.getByRole("button", { name: "Resize image" }).click();
    await expect(page.getByText(/413 × 531 px/)).toBeVisible();
    await expect(page.getByText("within limit")).toBeVisible();
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
    const out = fs.readFileSync((await d.path())!);
    expect(out[0]).toBe(0xff); expect(out[1]).toBe(0xd8); // real JPEG
    expect(out.length).toBeLessThanOrEqual(100 * 1024);
    // impossible: tiny size limit on noisy image
    await page.getByLabel("Max size (KB)").fill("1");
    await page.getByRole("button", { name: "Resize image" }).click();
    await expect(page.getByText(/Could not reach 1 KB at acceptable quality/)).toBeVisible();
    // unsupported type
    await page.getByLabel("Add a photo").setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await expect(page.getByText(/unsupported format/)).toBeVisible();
    // batch is a paid feature
    await page.getByLabel("Add a photo").setInputFiles([{ name: "1.png", mimeType: "image/png", buffer: makePng(50, 50) }, { name: "2.png", mimeType: "image/png", buffer: makePng(50, 50) }]);
    await expect(page.getByText(/Batch processing is a paid feature/)).toBeVisible();
  });

  test("QR: payload validation, PNG/SVG export, UPI warning", async ({ page }) => {
    await page.goto("/tools/qr-business");
    await page.getByLabel("Website link").fill("javascript:alert(1)");
    await expect(page.getByRole("alert")).toContainText("Only http and https");
    await page.getByLabel("Website link").fill("example.com/menu");
    await expect(page.getByRole("img", { name: "Generated QR code" })).toBeVisible();
    const [svg] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download SVG" }).click()]);
    expect(fs.readFileSync((await svg.path())!, "utf8")).toContain("<svg");
    const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download PNG/ }).click()]);
    expect(fs.readFileSync((await png.path())!).subarray(1, 4).toString()).toBe("PNG");
    await page.getByLabel("What should the QR code open?").selectOption("upi");
    await expect(page.getByText(/does not mean you have been paid/)).toBeVisible();
    await page.getByLabel("UPI ID").fill("bad id");
    await expect(page.getByRole("alert")).toContainText("valid UPI ID");
  });

  test("Invitation: Odia text uses the Odia font; free export is watermarked; missing fields warned", async ({ page }) => {
    await page.goto("/tools/invitation");
    await expect(page.getByText(/Names, date and venue are empty/)).toBeVisible();
    await page.getByLabel("Language").selectOption("or");
    await page.getByLabel("Names").fill("ରାମ ଓ ସୀତା");
    await page.getByLabel("Venue").fill("ଭୁବନେଶ୍ୱର");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Oriya"', "ରାମ"))).toBe(true);
    // the canvas actually contains painted pixels in the text area
    const painted = await page.evaluate(() => { const c = document.querySelector("canvas")!; const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120 && d[i + 1] < 120) n++; return n; });
    expect(painted).toBeGreaterThan(200);
    const [png] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG · free" }).click()]);
    expect(png.suggestedFilename()).toContain("preview");
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF · free" }).click()]);
    expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page.getByRole("button", { name: "Suggest wording (AI)" })).toBeDisabled(); // AI needs an account (cost control)
    await expect(page.getByText("Sign in to use AI suggestions")).toBeVisible();
    await page.getByLabel("Names").fill("N".repeat(100));
    await page.getByLabel("Venue").fill("Very long venue ".repeat(10));
    await expect(page.getByRole("img", { name: "Invitation preview" })).toBeVisible();
  });
});

test.describe("mini-business page", () => {
  test("draft free; publish needs the plan; public page is XSS-safe; slug collision handled", async ({ page, browser }) => {
    await register(page);
    await page.goto("/tools/qr-business");
    await page.getByRole("tab", { name: "Mini-business page" }).click();
    await page.getByLabel("Business name").fill(`<img src=x onerror="window.__xss=1">Priya Salon`);
    await page.getByLabel("Page address").fill("priya-salon");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/needs the Hosted business page plan/)).toBeVisible();
    await buy(page, "/checkout/plan/qr-page-year");
    await page.goto("/tools/qr-business");
    await page.getByRole("tab", { name: "Mini-business page" }).click();
    await expect(page.getByLabel("Page address")).toHaveValue("priya-salon");
    await page.getByLabel("Website").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/Only http and https/)).toBeVisible();
    await page.getByLabel("Website").fill("priyasalon.example");
    await page.getByLabel("Tagline").fill("Hair & skin");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    const anon = await browser.newContext(); const pub = await anon.newPage();
    let dialog = false; pub.on("dialog", () => (dialog = true));
    await pub.goto("http://localhost:5174/p/priya-salon");
    await expect(pub.getByRole("heading", { level: 1 })).toContainText("Priya Salon");
    await expect(pub.getByRole("heading", { level: 1 })).toContainText("<img src=x");
    expect(await pub.evaluate(() => (window as any).__xss)).toBeUndefined(); expect(dialog).toBe(false);
    await expect(pub.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://priyasalon.example/");
    await pub.goto("http://localhost:5174/p/does-not-exist"); await expect(pub.getByText("Page not found")).toBeVisible();
    // slug collision from another user
    const other = await anon.newPage(); await register(other);
    await other.goto("http://localhost:5174/tools/qr-business"); await other.getByRole("tab", { name: "Mini-business page" }).click();
    await other.getByLabel("Business name").fill("Copycat"); await other.getByLabel("Page address").fill("priya-salon");
    await expect(other.getByText("That address is taken.")).toBeVisible();
    await anon.close();
  });
});

test.describe("admin", () => {
  test("administrator sees metrics, can refund and revoke access", async ({ page, browser }) => {
    const ctx = await browser.newContext(); const cust = await ctx.newPage();
    const e = await register(cust); await buy(cust, "/checkout/plan/photo-batch");
    await page.goto("/login"); await page.getByLabel("Email").fill("admin@e2e.local"); await page.getByLabel("Password").fill("E2E-Admin-Pass-1"); await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/account/);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
    await expect(page.getByText("Paid orders")).toBeVisible();
    await page.getByRole("tab", { name: "Orders" }).click();
    await page.getByLabel(/Search by email/).fill(e);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Refund" }).click();
    await expect(page.getByRole("cell", { name: "refunded" })).toBeVisible();
    await cust.goto("/account"); await expect(cust.getByText("Files per batch").first()).toBeVisible();
    const lim = await cust.request.get("/api/entitlements"); const body = await lim.json();
    expect(body.access.find((a: any) => a.product === "photo-tools").limits.maxFiles).toBe(1);
    await page.getByRole("tab", { name: "Audit" }).click(); await expect(page.getByText("admin.refund").first()).toBeVisible();
    await ctx.close();
  });
});

test.describe("AI is optional", () => {
  test("signed-in users get a clear fallback when AI is not configured; manual editing still works", async ({ page }) => {
    await register(page);
    await page.goto("/tools/invitation");
    await page.getByRole("button", { name: "Suggest wording (AI)" }).click();
    await expect(page.getByText(/not enabled on this server/)).toBeVisible();
    await page.getByLabel("Message (optional)").fill("Please join us!");
    await expect(page.getByRole("img", { name: "Invitation preview" })).toBeVisible();
    await page.goto("/tools/resume");
    await page.getByRole("button", { name: "+ New resume" }).click();
    await page.getByRole("tab", { name: "AI help" }).click();
    await expect(page.getByText(/not switched on for this server/)).toBeVisible();
    await page.getByRole("tab", { name: "Resume" }).click();
    await page.getByLabel("Full name").fill("Asha Mohanty");
    await page.getByLabel("Professional summary").fill("Fresher with React skills. Built a billing app.");
    await page.getByLabel("Skills (comma separated)").fill("React, Excel");
    await expect(page.getByRole("heading", { level: 1, name: "Asha Mohanty" })).toBeVisible();
    await expect(page.getByText("Missing section: education.")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Job match" }).click();
    await page.getByLabel("Paste the job description").fill("We need React and SQL experience with Excel reporting.");
    await expect(page.locator("p", { hasText: "Missing:" })).toContainText("sql");
    // premium templates are gated
    await page.getByRole("tab", { name: "Resume" }).click();
    await expect(page.getByRole("option", { name: /Modern.*premium/ })).toBeDisabled();
  });
});

test.describe("revenue features", () => {
  test("admin creates a promo code, customer applies it at checkout and pays the lower price", async ({ page, browser }) => {
    await page.goto("/login"); await page.getByLabel("Email").fill("admin@e2e.local"); await page.getByLabel("Password").fill("E2E-Admin-Pass-1"); await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/account/); await page.goto("/admin");
    await page.getByRole("tab", { name: "Promo codes" }).click();
    await page.getByLabel("Code").fill("SAVE25"); await page.getByLabel("% off (1–90)").fill("25"); await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("cell", { name: "SAVE25" })).toBeVisible();
    const ctx = await browser.newContext(); const c = await ctx.newPage(); await register(c);
    await c.goto("/checkout/plan/pdf-batch");
    await c.getByLabel("Promo code (optional)").fill("BADCODE"); await c.getByRole("button", { name: "Apply" }).click();
    await expect(c.getByText("That code is not valid.")).toBeVisible();
    await c.getByLabel("Promo code (optional)").fill("save25"); await c.getByRole("button", { name: "Apply" }).click();
    await expect(c.getByText("− ₹7.25")).toBeVisible();
    await expect(c.getByRole("button", { name: "Pay ₹21.75" })).toBeVisible();
    await c.getByRole("button", { name: "Pay ₹21.75" }).click();
    await c.getByRole("button", { name: "Simulate successful payment" }).click();
    await expect(c.getByText(/₹21\.75/).first()).toBeVisible();
    await page.getByRole("tab", { name: "Overview" }).click(); await page.reload(); await expect(page.getByText(/Revenue, last 30 days/)).toBeVisible();
    await ctx.close();
  });

  test("inventory reports are locked on free and show real insight after upgrading", async ({ page }) => {
    await register(page);
    await page.goto("/tools/inventory"); await page.getByRole("tab", { name: "Items" }).click();
    await page.getByRole("button", { name: "+ New product" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("Soap"); await d.getByLabel("SKU").fill("SOAP"); await d.getByLabel("Selling price ₹").fill("100"); await d.getByLabel("Cost price ₹").fill("60"); await d.getByLabel("Opening stock").fill("10");
    await d.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Update stock" }).click(); await page.getByRole("dialog").getByLabel("Quantity").fill("4"); await page.getByRole("button", { name: "Record" }).click();
    await page.getByRole("tab", { name: "Reports" }).click();
    await expect(page.getByText("Know what makes you money")).toBeVisible();
    await buy(page, "/checkout/plan/inventory-pro");
    await page.goto("/tools/inventory"); await page.getByRole("tab", { name: "Reports" }).click();
    await expect(page.getByText("Top sellers")).toBeVisible();
    await expect(page.getByText("₹160").first()).toBeVisible(); // 4 sold x (100-60)
  });

  test("invoice dashboard shows overdue money; premium templates are locked until paid", async ({ page }) => {
    await register(page); await page.goto("/tools/invoice");
    await page.getByLabel("Business name").fill("Test Co"); await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "+ New invoice" }).click();
    await page.getByLabel("Customer name").fill("Late Payer"); await page.getByLabel("Description 1").fill("Work"); await page.getByLabel("Rate ₹").fill("1000");
    await page.getByLabel("Due date").fill("2020-01-01");
    await expect(page.getByRole("option", { name: /Modern.*paid/ })).toBeDisabled();
    await page.getByRole("button", { name: "Create invoice" }).click();
    await page.getByRole("button", { name: "← All documents" }).click();
    await expect(page.getByText("1 overdue invoice(s) – follow up today")).toBeVisible();
    await page.getByRole("button", { name: "INV-0001" }).click();
    await expect(page.getByRole("link", { name: "Send payment reminder" })).toHaveAttribute("href", /wa\.me.*pending/);
  });

  test("admin can suspend a customer, who is then locked out", async ({ page, browser }) => {
    const ctx = await browser.newContext(); const c = await ctx.newPage(); const e = await register(c, "Suspend Me");
    await page.goto("/login"); await page.getByLabel("Email").fill("admin@e2e.local"); await page.getByLabel("Password").fill("E2E-Admin-Pass-1"); await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/account/); await page.goto("/admin");
    await page.getByRole("tab", { name: "Users" }).click(); await page.getByLabel("Search users by name or email").fill(e);
    await page.getByRole("row", { name: new RegExp(e) }).getByRole("button", { name: "Open" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Suspend account" }).click();
    await expect(page.getByRole("button", { name: "Re-enable account" })).toBeVisible();
    await c.goto("/account"); await expect(c).toHaveURL(/login/);
    await c.getByLabel("Email").fill(e); await c.getByLabel("Password").fill("Sup3r-secret-pass"); await c.getByRole("button", { name: "Sign in" }).click();
    await expect(c.getByRole("alert")).toContainText("suspended");
    await ctx.close();
  });
});

test("business page form checks input in the browser, with no failed requests", async ({ page }) => {
  await register(page);
  const bad: string[] = []; page.on("response", (r) => { if (r.url().includes("/api/pages/mine") && r.request().method() === "PUT") bad.push(String(r.status())); });
  await page.goto("/tools/qr-business"); await page.getByRole("tab", { name: "Mini-business page" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Enter your business name.")).toBeVisible();
  await page.getByLabel("Business name").fill("Priya Salon");
  await expect(page.getByLabel("Page address")).toHaveValue("priya-salon"); // follows the name until edited
  await page.getByLabel("Page address").fill(`salon-${Date.now().toString(36)}`); // unique: another test already owns priya-salon
  await page.getByLabel("WhatsApp (with country code)").fill("123");
  await page.getByLabel("Website").fill("not a url at all");
  await page.getByLabel("UPI ID shown on page (optional)").fill("bad");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Include the country code, e.g. 919876543210.")).toBeVisible();
  await expect(page.getByText("Enter a valid UPI ID, e.g. name@bank.")).toBeVisible();
  expect(bad).toEqual([]); // nothing was sent to the server
  await page.getByLabel("WhatsApp (with country code)").fill("919876543210"); await page.getByLabel("Website").fill("priya.example"); await page.getByLabel("UPI ID shown on page (optional)").fill("priya@okbank");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  expect(bad).toEqual(["200"]);
});
