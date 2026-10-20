# Test plan and latest results

All numbers below come from actual runs on the development machine (macOS, Node 26) on 19 Oct 2026.

| Suite | Command | Result |
|---|---|---|
| Shared unit (money, invoice maths, validators, catalog) | `npm test -w @ek/shared` | **14 / 14 passed** |
| API integration (Supertest + in-memory MongoDB) | `npm test -w @ek/api` | **70 / 70 passed** (6 files) |
| Web unit (React Testing Library) | `npm test -w @ek/web` | **8 / 8 passed** |
| Browser E2E (Playwright, Chromium desktop + mobile viewport, axe) | `npm run test:e2e` | **35 / 35 passed** |
| Type checking | `npm run typecheck` | clean |
| Production build | `npm run build` | succeeds |
| Dependency audit | `npm audit` | 0 vulnerabilities |

## Coverage map (brief §14)
- **Auth:** register, duplicate email, invalid password, failed login (generic), expired + single-use reset token, unauthenticated access, CSRF, cross-user access, export/delete, login rate limit.
- **Invoices:** subtotal/tax/discount/rounding, invalid qty/rate/tax/overpay, sequential numbers under concurrency, monthly quota + credits, revisions, payment status never overstated, quotation→invoice exactly once (race tested), draft delete vs void, CSV formula injection, logo magic bytes, isolation; E2E creates an invoice and downloads/parses the PDF.
- **Resume:** all sections, unicode/Odia, special chars, over-long input, free-plan limits + template gating, AI disabled / failing / invalid / invented-number / daily-limit fallbacks, keyword match, isolation; E2E editing, checks, job match.
- **Inventory:** stock in/out/sale/return/damage/adjust, history, negative stock rejected, **25 concurrent sales never oversell**, no lost concurrent stock-ins, weighted-average valuation, duplicate SKU, isolation, low-stock + expiry lists, plan cap, CSV import preview/errors/duplicates/commit, export→re-import.
- **Invitation:** schema validation, per-user isolation; E2E Odia font loading + painted canvas + visual check, missing-field warning, long-text, watermarked PNG/PDF, AI fallback. *Visual correctness of Odia was verified by screenshot review, not automated glyph comparison.*
- **PDF utility:** merge (5 pages from 2+3), split ranges → ZIP page counts, invalid ranges, fake and corrupted PDFs rejected. *Not automated:* password-protected-file rejection (uses pdf-lib's encryption error; covered by code path, not a fixture), oversized files (limit logic only), and cancellation.
- **QR / pages:** URL/UPI validation, XSS payload rendered inert on the public page (E2E + unit), slug reserved/collision/availability, draft not public, publish needs plan, hosting lapses with plan, SVG + PNG export. *QR decoding round-trip is not automated* (no decoder library installed) – use the scan-test guidance in the UI.
- **Photo:** preset resize to exact dimensions, real JPEG ≤ size limit, impossible target explained, unsupported type, batch gating. *Not automated:* very large (>50 MP) images, ZIP batch output.
- **Payments/downloads:** success, failure, cancel + retry, forged signature, duplicate verify (race), duplicate webhook, amount mismatch, delayed webhook, bundles, refund revokes access (incl. issued links), late capture cannot resurrect refund, atomic credit spending, unpaid download denied + logged, link bound to user, tampered/expired link, real ZIP contents + templates pass the importer.
- **Platform:** admin API 401/403, price override affects checkout, audit trail, unpublish, security headers, malformed JSON, 60 concurrent requests, rate limit; E2E admin refund; axe (WCAG A/AA, serious+critical) on 10 pages, keyboard skip-link, aria-invalid errors, reduced motion, 375 px no-horizontal-scroll.

- **Revenue features:** promo codes (create, duplicate, apply, max uses, expiry, deactivate, ₹1 floor, customers cannot create), premium invoice templates gate + overdue summary, inventory reports gate + figures, user suspension/re-enable, revenue series. A site-wide E2E sweep opens every public page, tool and signed-in screen and fails on any console error or failed API call.

## Not tested (see README "Known limitations")
Razorpay live/test-mode traffic · Docker image build · real SMTP · real LLM · Safari/Firefox · load beyond 60 concurrent requests · screen-reader manual pass.
