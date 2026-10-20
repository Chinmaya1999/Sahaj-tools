# Pricing configuration

All prices are **experiments** (per the brief) and live in `packages/shared/src/catalog.ts`; admins can override price / purchasable per plan and publish/unpublish products in **Admin → Catalog** without redeploying.

| Plan id | Product | Price | Type | Grants |
|---|---|---|---|---|
| invoice-free | Invoice | ₹0 | free | 2 new documents / calendar month |
| invoice-starter | Invoice | ₹29 | credits | +10 documents (no expiry) |
| invoice-pro | Invoice | ₹99 | 30 days | unlimited documents |
| resume-free / resume-premium | Resume | ₹0 / ₹79 | free / one-time | 2 saved resumes, classic template / unlimited resumes, modern+compact templates, application package |
| inventory-free / -pro / -business | Inventory | ₹0 / ₹99 / ₹299 | free / 30 days | 25 / 500 / 5,000 products; Pro & Business include the Starter Kit download |
| invitation-pack | Invitation | ₹49 | credits | 5 watermark-free downloads |
| pdf-batch | PDF utility | ₹29 | 30 days | 100 MB files, 50 files per job (free: 25 MB, 10 files) |
| qr-page-year | QR/mini page | ₹199 | 1 year | publish one hosted page + poster templates |
| qr-poster | QR/mini page | ₹49 | one-time | poster templates |
| photo-batch | Photo | ₹29 | 30 days | batches up to 50 images (free: 1 at a time) |
| bundle-student | – | ₹99 | bundle | resume-premium + pdf-batch + photo-batch |
| bundle-shop | – | ₹149 | bundle | invoice-pro + inventory-pro |

Rules: "30 days"/"1 year" plans do **not** auto-renew. Credits are consumed atomically. Prices shown on checkout are final amounts; no promo codes exist (none were configured). Hosted pages go offline when the hosting plan expires.

## Paid perks (what makes people upgrade)
- **Invoice:** Starter/Pro unlock Modern + Minimal templates; Pro also removes the "generated with Sahaj" footer from PDFs. Free users still get the money dashboard (waiting to be paid, overdue, billed this month) and WhatsApp reminders.
- **Inventory:** Pro/Business unlock Sales & profit reports (top sellers, unsold stock, stock value by category; profit is estimated from current prices) and the Starter Kit download.
- **Promo codes:** created in Admin → Promo codes (1–90% off, optional max uses/expiry). Applied by the server at checkout; price never below ₹1; use counted when payment is confirmed.
