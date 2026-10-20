# Deployment, backup and rollback

Deployment to a live host was **not performed** (no hosting account/domain available in this environment). Docker was also unavailable on the development machine, so the `Dockerfile` has not been built locally – CI builds it. Follow this checklist and treat the first deploy as the verification.

## Recommended low-cost shape
One container (API serves the built SPA) + MongoDB Atlas M0/M10 + HTTPS from the host. Works on Render, Fly.io, Railway, or any VPS with Docker.

1. `docker build -t everydaykit .` (or let the host build from the repo's Dockerfile).
2. Set environment variables from `.env.example` in the host's secret store: `NODE_ENV=production`, `WEB_ORIGIN=https://your-domain`, `MONGODB_URI`, `SESSION_SECRET`, `DOWNLOAD_SECRET`, `PAYMENT_PROVIDER=razorpay` + keys, `SMTP_URL`, `ADMIN_EMAIL/PASSWORD`, optional `LLM_*`.
3. Health check path: `/api/health`. The process listens on `PORT` (default 4000).
4. First boot builds MongoDB indexes automatically and creates the admin user.
5. Add the Razorpay webhook (payments.md). Smoke-test: register → buy a cheap plan in test mode → download → refund.

Compose (self-host): `docker compose up -d --build` (uses a local Mongo volume; for production prefer Atlas).

## CI/CD
`.github/workflows/ci.yml`: install → typecheck → unit/integration → build → `npm audit` → Playwright E2E → Docker build. Add a deploy job for your host (e.g. Render deploy hook) gated on `main`.

## Backups & restore
- Atlas: enable continuous/scheduled **Cloud Backup** (M10+) – M0 free clusters have no automated backups; for M0 schedule `mongodump`:
  `mongodump --uri "$MONGODB_URI" --gzip --archive=backup-$(date +%F).gz`
- Restore: `mongorestore --uri "$TARGET_URI" --gzip --archive=backup-YYYY-MM-DD.gz --drop` into a **staging** database first, point a staging deploy at it and verify login + an invoice before touching production. Do this drill once before launch.
- User-level backup: customers can export JSON (Account → Settings), invoices CSV, inventory CSV, movements CSV.

## Retention (as implemented)
Sessions 14 days (TTL) · reset tokens 30 min (TTL) · webhook event ids 90 days (TTL) · customer content until deleted · orders/payments kept without user link after account deletion · audit log kept (no TTL – add one if your policy requires).

## Rollback
1. Redeploy the previous image tag/commit (the app has no destructive migrations; MongoDB collections are schema-flexible and indexes are additive).
2. If a bad catalog price was set, fix in Admin → Catalog (affects only new orders).
3. If data was damaged, restore from backup into staging, diff, then repair/restore selectively.
