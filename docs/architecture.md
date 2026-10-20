# Architecture

**Stack (MERN):** React 19 + Vite + TypeScript + Tailwind v4 + Framer Motion + React Router + TanStack Query (web) · Node 22+ / Express 5 + TypeScript + Mongoose (API) · MongoDB (Atlas free tier works) · Zod for validation shared by both sides · Vitest, React Testing Library, Supertest, Playwright, axe-core.

> The original brief preferred PostgreSQL/Prisma; the project was built on MongoDB per the owner's request. Consequences are listed below under "MongoDB notes".

## Layout (npm workspaces monorepo)
```
apps/api        Express API (modular monolith). src/routes = one file per area, src/services = shared logic
apps/web        React SPA. src/tools = the 7 products, src/pages = marketplace, src/components = design system
packages/shared Pricing catalog, money, invoice maths, Zod schemas, QR payload + CSV helpers (used by BOTH sides)
tests/e2e       Playwright browser journeys (run on an isolated in-memory Mongo)
docs/           this documentation
```
The brief's `packages/ui`, `packages/validation` and `products/*` directories were folded into `apps/web/src/components`, `packages/shared` and `apps/web/src/tools` + `apps/api/src/routes` – a module boundary per product without extra build plumbing.

## Where each product's logic lives
| Product | Browser | Server (auth, limits, persistence) |
|---|---|---|
| Invoice & Quotation | `tools/Invoice.tsx`, `invoicePdf.ts` (pdf-lib, ₹ + Odia fonts) | `routes/invoices.ts`, `shared/invoiceCalc.ts` – **totals recomputed server-side** |
| Resume | `tools/Resume.tsx` (live preview, print-to-PDF, keyword match) | `routes/products.ts` (CRUD, template gating, AI endpoint) |
| Inventory | `tools/Inventory.tsx` | `routes/inventory.ts` – atomic movements, CSV import/export |
| Invitation | `tools/Invitation.tsx`, `invitationRender.ts` (canvas, PNG/PDF) | saved designs, AI wording, credit spending |
| PDF utility | `tools/PdfTools.tsx` (pdf-lib, **no upload**) | entitlement limits only |
| QR + mini page | `tools/QrBusiness.tsx`, `BusinessPageView.tsx`, `/p/:slug` | page CRUD, slug uniqueness, public read, hosting entitlement |
| Photo helper | `tools/PhotoTools.tsx` (canvas, **no upload**) | entitlement limits only |

## Shared platform pieces (not duplicated per product)
- **Auth/session:** random 256-bit token in an httpOnly SameSite=Lax cookie; only its SHA-256 is stored (`Session`, TTL-expiring). Argon2id passwords (`@node-rs/argon2`).
- **Catalog & pricing:** `packages/shared/src/catalog.ts` is the single source; admins can override price / purchasable / published in the DB (`CatalogOverride`).
- **Entitlements:** `services/access.ts` merges the free plan with active entitlements → limits + credits. Used by invoice quota, inventory item cap, resume templates, QR hosting, etc.
- **Payments:** `services/payments/*` provider adapter (Razorpay + local sandbox) → `services/billing.ts` (single place an order becomes paid) → entitlements.
- **Downloads:** HMAC-signed, per-user, 5-minute links; entitlement re-checked on every fetch; every event logged (`DownloadRecord`).
- **LLM adapter:** `services/llm.ts` provider-neutral, server-side key, per-user + global daily caps, JSON-schema validation, deterministic "no invented numbers" guard.
- **Audit log:** auth events, order/payment events, admin actions, account export/deletion.

## Purchase flow
1. Browser sends only `{itemType, itemId}`. Server loads the authoritative price (catalog + overrides), creates a `pending` Order and a provider order.
2. Customer pays. Browser posts the provider's signed result to `/api/billing/verify`; the server verifies the HMAC (and, for Razorpay, fetches the payment to confirm `captured` + amount).
3. `settlePayment()` does an atomic `pending|failed|cancelled → paid` transition (exactly one winner), records the `Payment` (unique provider payment id), then upserts entitlements under a unique `(order, plan)` index. Re-running it repairs a crash between steps.
4. Provider webhooks (`/api/webhooks/payments`, raw body, signature-verified, `WebhookEvent` unique event id) take the same path, plus refund/dispute handling that revokes/suspends entitlements.

## MongoDB notes
- No multi-document transactions are used (works on standalone Mongo and Atlas alike). Concurrency safety comes from single-document atomic updates and unique indexes instead: conditional `$inc` with `quantity >= n` for stock-outs, aggregation-pipeline updates for weighted-average cost, counter `$inc` + unique `(owner, kind, number)` for document numbers, atomic status transitions for payments.
- Tenant isolation: every private query includes the authenticated owner id; cross-user access returns 404 (tested).
- Money is stored as integer paise; calculations use decimal.js.
