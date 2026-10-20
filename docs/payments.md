# Payment gateway guide

**Important:** the brief said "use my existing gateway" but no gateway was present in the repository and none was named. I implemented **Razorpay** (the common choice in India) behind a provider interface and a **local sandbox** provider. If you use another gateway, implement `PaymentProvider` (`apps/api/src/services/payments/provider.ts`, ~60 lines) – nothing else changes.

## Status – be honest about what was tested
| Piece | Verified how |
|---|---|
| Order lifecycle, signature verification, webhooks, idempotency, refunds, entitlements | Automated tests against the **sandbox** provider (which signs with HMAC-SHA256 like Razorpay). 63 API tests + browser E2E |
| Razorpay adapter (`razorpay.ts`) | **Not run against Razorpay** (no credentials were available). Written to the documented API: `POST /v1/orders`, checkout signature `HMAC_SHA256(order_id|payment_id, key_secret)`, webhook `X-Razorpay-Signature = HMAC_SHA256(raw body, webhook_secret)`, `X-Razorpay-Event-Id`, `GET /v1/payments/:id`, `POST /v1/payments/:id/refund`. **You must run a Razorpay test-mode purchase before going live.** |

## Setup (Razorpay)
1. Razorpay Dashboard → Test mode → Settings → API keys → generate. Put in `.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, set `PAYMENT_PROVIDER=razorpay`.
2. Settings → Webhooks → add `https://YOUR_DOMAIN/api/webhooks/payments`, choose a secret → `RAZORPAY_WEBHOOK_SECRET`. Events: `payment.captured`, `payment.failed`, `refund.processed`, `payment.dispute.created`.
3. Test with Razorpay's test cards/UPI; confirm: order → paid, receipt number, entitlement visible in Account → Library; refund from Admin → access removed.
4. Switch to live keys only after a full test pass. Keep keys only in the host's secret store.

## Rules enforced in code
- Browser sends ids only; price always from server. Amount mismatch → order **not** paid, audit logged.
- Entitlements are only created by `settlePayment()` after signature verification.
- Duplicate verify/webhook deliveries are idempotent (atomic status transition, unique payment id, unique event id, unique `(order, plan)`).
- `PAYMENT_PROVIDER=sandbox` **refuses to start** when `NODE_ENV=production`.
- Refunded orders lose access (including already-issued download links). Disputes suspend access.
- No card/UPI credentials are ever received or stored. Logs redact signatures/tokens.
- Plans are fixed-period one-time purchases (no auto-renewing provider subscriptions) – simpler and no mandate handling.
- Taxes: prices are shown as final amounts; no GST invoice is generated for the customer's purchase (receipts say "not a tax invoice"). Get accounting advice before launch.
