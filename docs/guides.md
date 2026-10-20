# Usage guides

## Customer guide
1. **Try free:** PDF, photo, QR and invitation tools need no account. Invoices, resumes and inventory need a free account (they save your work).
2. **Buy:** pick a plan on the product page → Checkout shows the exact price → pay → you land on a confirmation with your receipt number. Access is unlocked only after the payment is confirmed (usually seconds; if it says "waiting", it applies automatically – contact support with your order number if you were charged and nothing changes).
3. **Use:** Account → Overview shows your limits, credits and expiry. Account → Library lists plans and downloads (Inventory Pro/Business include a Starter Kit ZIP with CSV templates and instructions). Download links last 5 minutes; request a new one anytime.
4. **Data:** Account → Settings → export everything or delete your account.
5. **Help:** Help centre FAQ → Contact support.

Tips: invoices – set business details once, then new document → items → save; record payments as they arrive; "Void" instead of delete for issued documents. Inventory – use *Update stock* for every change (sale, return, damage…) so history stays accurate; import with a CSV template. Photos – choose a preset, then compare with your form's official rules.

## Administrator guide
Sign in with the admin account → **Admin**.
- **Overview:** users, paid orders, revenue, refunds, 30-day orders, conversion (paying users ÷ users), open support, system health (DB, provider, AI, uptime, server errors since start).
- **Orders:** search by email/order id/receipt; **Refund** calls the provider (sandbox simulates) and revokes access.
- **Users:** search; grant a plan to a user (support/goodwill; logged).
- **Overview:** also shows a daily revenue chart (7/30/90 days).
- **Promo codes:** create/disable discount codes; see how many times each was used.
- **Users → Open:** see a user's plans, orders and usage; revoke an entitlement; suspend/re-enable the account (suspended users are signed out and cannot sign in; admins cannot be suspended here).
- **Support:** add an internal note to each request.
- **Catalog:** publish/unpublish a product; change a plan's price or turn it off (new orders only).
- **Support:** triage requests (open → in progress → resolved).
- **Audit:** who did what (refunds, grants, price changes, logins, exports, deletions).
Downloadable assets are defined in code (`packages/shared/src/catalog.ts` + `apps/api/src/services/assets.ts`); adding a new one requires a code change and test.
