# Oqzra

Seven affordable micro-tools in one marketplace – **Invoice & Quotation**, **Resume Builder**, **Inventory & Expiry**, **Regional-language (English/Odia) Invitations**, **PDF utility**, **QR + mini-business page**, **Photo resize helper** – with accounts, real payments plumbing, entitlements, secure downloads and an admin dashboard.

MERN: MongoDB · Express · React (Vite, TypeScript, Tailwind, Framer Motion) · Node.

## Quick start
```bash
npm ci
cp .env.example .env     # set MONGODB_URI + secrets
npm run dev              # http://localhost:5173  (API on :4000)
```
Details: [docs/setup.md](docs/setup.md). Everything is documented in `docs/`:
[architecture](docs/architecture.md) · [setup](docs/setup.md) · [payments](docs/payments.md) · [security](docs/security.md) · [deployment & backup](docs/deployment.md) · [pricing](docs/pricing.md) · [AI](docs/ai.md) · [API](docs/api.md) · [test plan & results](docs/test-plan.md) · [user/admin guides](docs/guides.md)

## Tests (all executed; latest run in docs/test-plan.md)
`npm test` (14 shared + 70 API + 8 web) · `npm run test:e2e` (35 Playwright incl. accessibility and a no-errors site sweep) · `npm run typecheck` · `npm run build`

## What is real vs. what you must still do
**Real and tested:** auth/sessions, server-recomputed invoices, atomic inventory, entitlement-based limits, order → verified payment → entitlement pipeline (sandbox provider), webhooks, refunds, signed downloads, public QR pages, admin, account export/delete, 100% browser-side PDF/photo/invitation processing.

**Known limitations / external dependencies (nothing here is hidden):**
1. **Payment gateway:** none was specified or present. Razorpay is implemented but has **never been run against Razorpay** (no keys); the sandbox provider is what tests exercise. Do a Razorpay test-mode pass before launch ([payments.md](docs/payments.md)).
2. **Database:** MongoDB instead of PostgreSQL/Prisma (as requested). No multi-document transactions; atomicity is achieved with single-document operations + unique indexes.
3. **Not deployed:** no host/domain available. Docker/Compose/CI are written but the Docker image was **not built locally** (no Docker on the dev machine).
4. **Email:** password reset needs `SMTP_URL`; email verification is not implemented. Expiry/low-stock alerts are in-app only (no emails/WhatsApp).
5. **AI:** optional; no live model was available, so behaviour is tested with a fake model and **no accuracy figure is claimed** ([ai.md](docs/ai.md)). Odia wording/labels need review by a fluent speaker.
6. **Browser-tool limits** (PDF/photo file caps, watermark) are enforced client-side and are bypassable; server-side credits still gate clean invitation downloads.
7. **No desktop apps:** the only downloadable is a validated CSV-template ZIP (Inventory Starter Kit). Nothing is claimed to be native.
8. **Legal pages are drafts**; prices are experiments; no testimonials/user counts are shown because none exist.
9. **Untested:** Firefox/Safari, manual screen-reader pass, load beyond ~60 concurrent requests, QR decode round-trip, password-protected-PDF fixture, backup-restore drill.
10. **Security actions for you:** rotate the Atlas password that was shared in chat and change the seeded admin password ([security.md](docs/security.md)).

## Admin login (development)
`admin@everydaykit.local` with the `ADMIN_PASSWORD` from your `.env`. Change it: edit `.env`, run `npm run seed -- --reset-password`.
