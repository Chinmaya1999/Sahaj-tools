# Security checklist

✅ implemented & tested · ⚠️ partial / needs your action · ❌ not done

## Application
- ✅ Argon2id password hashing; ≥10 chars with letter+digit; generic login errors; dummy hash on unknown email (no timing oracle)
- ✅ Sessions: random token, only hash stored, httpOnly + SameSite=Lax + Secure in production, 14-day TTL index, all sessions revoked on password reset
- ✅ CSRF: SameSite cookie + required `X-Requested-With: ek` header + Origin allow-list on every state-changing request (tested)
- ✅ Authorization on the server for every private route; admin routes behind `requireAdmin`; cross-user ID tampering returns 404 (tested for invoices, inventory, resumes, designs, orders, downloads)
- ✅ Zod validation on every body/query; Mongo operator injection not possible (values are parsed to primitives); regex search input escaped
- ✅ Output encoding: React escapes all user content; public business pages re-validate links (http/https/tel/mailto only); CSV exports neutralise formula injection (tested)
- ✅ Logo uploads: size-limited data URLs, MIME + magic-byte verified server-side
- ✅ Helmet headers incl. strict CSP, HSTS, frame-ancestors none; CORS allow-list; 2 MB JSON limit; webhook 256 KB raw limit
- ✅ Rate limits: global, login (20/15 min), register, forgot-password, support, AI endpoints (tested for login)
- ✅ Error handler never returns stack traces; structured pino logs with redaction
- ✅ Payments: signature verification, replay protection, amount check, idempotency (see payments.md)
- ✅ Downloads: signed, user-bound, 5-min links, entitlement re-check, event log
- ✅ No server-side file uploads for PDF/photo/invitation tools (processed in-browser) → no upload attack surface, no malware-scan needed. PDF/image inputs still validated by magic bytes, size, page count, encryption in the browser
- ✅ Account export + permanent deletion; audit log for sensitive actions
- ✅ `npm audit`: 0 known vulnerabilities at the time of writing (also enforced in CI at `high`)
- ✅ AI: key server-side only; per-user and global daily caps; outputs schema-validated; resume AI cannot introduce numbers not supplied by the user

## Needs your action before launch
- ⚠️ **Rotate the MongoDB Atlas password** that was pasted into the chat that created this project, and restrict the Atlas Network Access list to your server's IPs. The local `.env` (gitignored) currently contains it.
- ⚠️ **Change the seeded admin password** (`ADMIN_PASSWORD` in `.env` was a throwaway default). After editing `.env`: `npm run seed -- --reset-password`. Consider limiting admin accounts and adding 2FA at your identity layer.
- ⚠️ Set strong random `SESSION_SECRET` / `DOWNLOAD_SECRET` in production.
- ⚠️ Serve over HTTPS and from **one origin** (the Docker image serves the SPA from the API) so SameSite cookies work. If you split web/API across domains, CSRF/cookie design must be revisited.
- ⚠️ Razorpay adapter must be tested with real test-mode keys (payments.md).
- ⚠️ Legal pages are drafts; get legal review.

## Known gaps / honest risks
- ❌ Email verification is not implemented (accounts are usable immediately). Password reset needs SMTP.
- ❌ No MFA, no account lockout beyond IP rate limiting, no CAPTCHA on registration/support.
- ⚠️ Browser-side tools (PDF, photo, invitation) enforce plan limits in the browser: a determined user can bypass the *client* limits (file-count/size caps, watermark). Invitation clean downloads do consume a server-side credit, but the image itself is rendered client-side. These are low-value, low-cost features; documented rather than hidden.
- ⚠️ Registration reveals whether an email is registered (409). Chosen for usability; password reset does not leak.
- ⚠️ Rate limiter is in-memory per process – with multiple instances, use a shared store (e.g. Redis).
- ⚠️ No dependency-update automation, SAST, or container scanning configured.
- ⚠️ Backups rely on your MongoDB provider (see deployment.md); restore was not drill-tested here.
