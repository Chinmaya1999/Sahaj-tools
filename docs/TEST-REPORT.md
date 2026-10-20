# Full application test report

Date: 2026-10-20 · Build under test: `main` (production tag `a8d149c4cee6`) · Environment: isolated in-memory MongoDB for automated runs, plus read-only/throwaway-account checks on the live site.

## Result: everything passed

| Check | Result |
|---|---|
| Type checking (shared, API, web) | 0 errors |
| Shared logic unit tests | 19 / 19 |
| API and business-logic tests | 98 / 98 |
| Web component and native-bridge tests | 17 / 17 |
| Browser tests (Chromium, real UI, demo data) | 45 / 45 (0 flaky, 0 skipped, 140 s) |
| Production dependency audit | 0 vulnerabilities |
| Production build | succeeds |
| Live site health (14 URLs, HTTPS, headers, auth probes) | all as expected |
| Live demo shop run (throwaway account, then deleted) | 9 / 9 assertions + clean deletion |
| Concurrency burst on live API (50 requests, 10 at a time) | 50 / 50 OK, median 184 ms, p95 215 ms |

## How it was tested
1. **Independent-arithmetic demo business.** `apps/api/test/demo-business.test.ts` runs a realistic day at "Oqzra Kids Wear" through the real API: 4 products, 1 supplier, 3 customers, a purchase order with partial deliveries and a rejected piece, 8 orders (walk-in, credit, online reserve→pack→ship→deliver, two cancellations), 2 returns, expenses, a damage write-off, a stock count and a cash close. Every expected figure is computed in the test with plain arithmetic, not with the app's own code, then compared with what the app reports.
2. **UI walkthrough with demo data.** `tests/e2e/demo-shop.spec.ts` drives the real screens: add customer and supplier, create a purchase order, receive goods (accepted/rejected), pay the supplier, pack with scanning (including a deliberate scan mismatch), dispatch, deliver, record the balance payment, add an expense, close the day with a cash shortage, count stock, and open all eight reports.
3. **Existing suites** for every other tool (invoices, resume, invitations, PDF, photo, QR and business page), billing and payments, admin, security and accessibility.
4. **Live checks** on https://sahaj.cmcloud.online and https://sahaj.api.cmcloud.online.

## Demo day: what the app reported (all matched the hand calculation)
| Figure | Amount |
|---|---|
| Sales revenue (before tax and shipping, after returns) | ₹9,809.00 |
| Tax collected (not revenue) | ₹1,043.83 |
| Cost of goods (weighted-average cost) | ₹6,875.00 |
| **Gross profit** | **₹2,934.00** |
| Shipping charged | ₹100.00 |
| Expenses (rent ₹5,000 + packaging ₹120) | ₹5,120.00 |
| **Net profit estimate** (a loss that day: rent is booked in full) | **−₹2,086.00** |
| Cash received (confirmed payments less refunds; pending and failed excluded) | ₹8,499.22 |
| Customers owe (Ravi ₹550.88 + Suresh ₹1,782.90) | ₹2,333.78 |
| You owe the supplier (28 accepted × ₹560 − ₹10,000 paid) | ₹5,680.00 |
| Stock value | ₹37,965.00 |
| Cash drawer expected | ₹4,900.34 (counted ₹5 short → difference −₹5.00 recorded) |

Weighted-average cost of the shirt after two deliveries: ₹500 → ₹528.42 → ₹535.00, exactly as calculated by hand.

## Business rules verified
**Stock**
- Every change creates a record (who, why, how much). For every product, the sum of its movement history equals the on-hand quantity.
- Creating a product with opening stock creates an opening movement. Duplicate SKUs and duplicate variants are refused. Negative prices and non-whole quantities are rejected by the server.
- Adding new products and updating existing stock are separate flows; a reason is mandatory; an unknown barcode creates nothing.
- Overselling is refused with `INSUFFICIENT_STOCK` (requested vs available), including 8 simultaneous sales of the last 5 units.
- Online orders reserve stock (on hand / reserved / available), and stock leaves exactly once at dispatch even if "Ship" is pressed twice.
- A purchase order alone never changes stock; only accepted goods enter stock; a delivery cannot be recorded twice; partial deliveries and rejections work.
- A stock count is applied only after confirmation, once.

**Sales and money**
- The server recalculates every total (line discounts, proportional order discount, per-line tax, shipping) and ignores client numbers.
- Retrying with the same idempotency key (even in parallel) gives the same order and deducts once.
- Part-payments leave a balance; overpayment is refused; pending and failed payments are not money received; confirming twice counts once.
- Cancelling works once: reservations are released and money already received becomes a pending refund.
- Returns: a refund and a restock are separate; only restockable items go back to stock; damaged items stay a cost; on a part-paid sale only the overpayment is refunded.
- Historical orders keep their price and cost when the product price later changes.
- Revenue, tax, cash, receivables, gross profit, net profit and stock value are kept separate and reconcile with each other and with the reports and CSV exports.

**Accounts, billing, security**
- Registration, login, logout, password reset (single use), session invalidation, suspension, admin protection, rate limiting, CSRF/foreign-origin blocking, security headers, data isolation between businesses.
- Server-side pricing, forged payment signatures rejected, duplicate and delayed webhooks do not double-grant, refunds revoke access, promo codes, signed short-lived download links.
- Account export and deletion cover every record, including all MiniStock data.
- Invoices: exact GST (₹5,350 → tax ₹755 → ₹6,105), part-payment to paid, overpayment refused, overdue flagged, quotation to invoice conversion exactly once, void instead of delete, formula-injection-safe CSV.

**Interface**
- Signed-in workspace (sidebar, ⌘K search, quick create), light and dark mode (remembered across reloads), phone layout without sideways scroll, accessibility scans clean in both themes, Content-Security-Policy allows Cashfree checkout while still blocking inline scripts.

## Problems found and fixed in this testing round and earlier today
- Cashfree payment window blocked by the security policy (form-action and frame-src): fixed, verified live.
- Saved light/dark theme ignored in production because an inline script was blocked: fixed, verified live.
- "Delete my account" and "export my data" did not include MiniStock records: fixed with a test.
- Dashboard cards stretched the page sideways on phones: fixed.
- The demo business found **no accounting discrepancies**. The few test failures during development were mistakes in my expectations, not defects in the app.

## Not covered (be aware)
- **Completing a real payment.** The Cashfree window opens and shows UPI, card and net banking, but I did not pay. Cashfree is still in sandbox mode.
- **Emails** (password reset, reminders): SMTP is not configured, so sending was not tested.
- **AI helpers** (resume, invitations): only the "not configured / failure" fallbacks and output validation are tested; no model key is set.
- **Browsers:** automated runs use Chromium only. Safari, Firefox and real phones were not tested.
- **Camera barcode scanning:** codes are typed or entered by a scanner that types; there is no camera scanner.
- **Load:** a short burst only (50 requests), not a sustained load test on the 1 GB server.
- **Not built yet:** staff accounts and roles, WhatsApp integration, shareable product catalog, warehouses and batches, a MiniStock AI assistant.
- The live site shares one Atlas database with development, and backups have not been verified.

## Re-run
```
npm run typecheck && npm test          # types, shared, API (incl. demo business), web
npm run test:e2e                       # all browser tests (starts its own isolated servers)
npx playwright test tests/e2e/demo-shop.spec.ts   # the UI demo walkthrough only
```
CI (`.github/workflows/ci-cd.yml`) runs all of this on every push and deploys only if it passes.

## Apps (added 2026-10-20)
| Check | Result |
|---|---|
| Android app on a Pixel 9 Pro emulator (Android 16), local test server | 19 / 19 device checks |
| Android app against the **live** site, 3 runs (one after a clean reinstall) | 19 / 19, 19 / 19, 19 / 19 (a first live run had 2 timing failures that did not recur) |
| CI-built signed Android APK | signature verified (v2), package `online.cmcloud.sahaj`, target Android 16, not debuggable, certificate matches the app-links file |
| Windows app (Electron) smoke test | 12 / 12 (isolation, menus, theme, safe links, file save, offline) |
| Windows installer built in CI; app starts and stays running | pass |
| iOS app compiled in CI (device and simulator) | pass |

Device checks cover: sign-in screen on launch, all 10 native plugins present, sign-up, phone workspace layout, login surviving an app restart, splash dismissal, a sale with part payment, camera-scan buttons, barcode lookup, the system share sheet and file written for a CSV, Android print service for the page and for a receipt, hardware back (go back / close a sheet / minimise), light-dark status bar, offline screen with automatic reconnect, no crashes or ANRs, no JavaScript errors.

Not tested: a physical phone, camera scanning of a real barcode (the emulator has no real camera), a real UPI/card payment inside the app, running the iOS app (no Xcode on the development Mac; it compiles in CI), and installing the Windows installer on a real Windows PC beyond the CI start-up check.
