# Local setup

**Requirements:** Node 22+ (developed on Node 26), npm 10+. A MongoDB database (free Atlas cluster, or `docker compose up mongo`).

```bash
npm ci
cp .env.example .env        # then edit: MONGODB_URI, secrets, ADMIN_EMAIL/PASSWORD
npm run seed                # creates the admin user (also happens on API start)
npm run dev                 # API :4000 + web :5173 (Vite proxies /api)
```
Open http://localhost:5173. In development the payment provider is the **sandbox**: checkout shows buttons to simulate success / failure / cancellation, and the result is verified by the server exactly like a real signed payment.

Password-reset emails are printed to the API console when `SMTP_URL` is empty (development only).

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | API + web with reload |
| `npm run typecheck` | `tsc` for all workspaces |
| `npm test` | unit + integration tests (shared, API with in-memory Mongo, web) |
| `npm run test:e2e` | Playwright (starts its own API on :4010, web on :5174, in-memory Mongo). First time: `npx playwright install chromium` |
| `npm run build` | production web build + API typecheck |
| `npm run seed -- --reset-password` | set the admin password to `ADMIN_PASSWORD` |
| `docker compose up --build` | app + Mongo in containers on :4000 |

## Changing brand, currency, prices
Brand, products, plans, limits and bundles: `packages/shared/src/catalog.ts`. Currency symbol/formatting: `packages/shared/src/money.ts`. Photo presets: `apps/web/src/tools/photoPresets.ts`. Prices can also be overridden live from **Admin → Catalog** (applies to new orders).
