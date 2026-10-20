# API reference (summary)

Base `/api`. JSON in/out. Cookie session (`ek_sid`). All non-GET requests need header `X-Requested-With: ek`. Errors: `{ "error": "human message", "code": "machine_code", ...extra }`; validation errors are 422 with `fields`.

**Auth** `POST /auth/register|login|logout|forgot|reset|change-password` · `GET /auth/me`
**Account** `PATCH /account` · `GET /account/export` · `DELETE /account {password, confirm:"DELETE"}`
**Catalog** `GET /catalog` (public; products, plans, bundles, assets with admin overrides applied)
**Billing** `POST /billing/checkout {itemType, itemId}` · `POST /billing/verify {orderId, paymentId, signature}` · `POST /billing/cancel` · `GET /billing/orders[/:id]` · dev only `POST /billing/sandbox/complete`
**Webhook** `POST /webhooks/payments` (raw body, provider signature)
**Entitlements** `GET /entitlements` · `GET /entitlements/library` · `POST /entitlements/spend {product:"invitation"}`
**Downloads** `GET /downloads` · `GET /downloads/history` · `POST /downloads/:id/link` → `GET /downloads/:id/file?exp&sig`
**Invoices** `GET|PUT /invoices/business` · `GET|POST /invoices` · `GET|PUT|DELETE /invoices/:id` · `POST /invoices/:id/{void|payments|duplicate|accept|convert}` · `GET /invoices/export.csv`
**Inventory** `GET|POST /inventory/items` · `PUT /inventory/items/:id` · `POST /inventory/items/:id/{archive|movements}` · `GET /inventory/{movements|dashboard|export.csv|movements.csv}` · `POST /inventory/import {rows, commit}`
**Resumes** `GET|POST /resumes` · `GET|PUT|DELETE /resumes/:id` · `POST /resumes/:id/duplicate` · `POST /resumes/{analyze|ai}`
**Invitations** `GET|POST /invitations` · `PUT|DELETE /invitations/:id` · `POST /invitations/ai`
**Pages** `GET|PUT|DELETE /pages/mine` · public `GET /public/pages/:slug` · `GET /public/pages-available?slug=`
**Support** `POST /support` · `GET /support/mine`
**Admin** (role=admin) `GET /admin/{stats|health|users|orders|orders/:id|catalog|support|audit}` · `POST /admin/orders/:id/refund` · `POST /admin/entitlements/grant` · `POST /admin/entitlements/:id/revoke` · `PUT /admin/catalog/{plan/:id|product/:slug}` · `PATCH /admin/support/:id`
