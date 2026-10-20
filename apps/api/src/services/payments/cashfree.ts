import crypto from "node:crypto";
import { env } from "../../env.js";
import { safeEqual } from "../../lib/security.js";
import { HttpError } from "../../lib/http.js";
import { logger } from "../../lib/logger.js";
import type { ParsedWebhook, PaymentProvider, WebhookEventType } from "./provider.js";

/**
 * Cashfree Payment Gateway adapter (https://docs.cashfree.com/reference/pg-new-apis-endpoint), API version 2023-08-01.
 * Checkout: the server creates an order and gets a payment_session_id; the browser opens it with the Cashfree JS SDK.
 * Cashfree gives the browser no signature, so /billing/verify asks Cashfree directly for the order's successful payment.
 * Webhook signature = base64(HMAC_SHA256(x-webhook-timestamp + rawBody, secret key)) in x-webhook-signature.
 * Requires CASHFREE_APP_ID, CASHFREE_SECRET_KEY and CASHFREE_ENV (sandbox | production).
 */
const base = () => (env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");
const need = () => {
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) throw new HttpError(503, "Payments are not configured", "payments_unconfigured");
  return { id: env.CASHFREE_APP_ID, secret: env.CASHFREE_SECRET_KEY };
};
async function cf(path: string, init: { method: string; body?: unknown }) {
  const k = need();
  const r = await fetch(`${base()}${path}`, {
    method: init.method,
    headers: { "content-type": "application/json", "x-api-version": "2023-08-01", "x-client-id": k.id, "x-client-secret": k.secret },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) logger.warn({ path, status: r.status, code: json?.code, message: json?.message }, "cashfree request rejected");
  if (!r.ok) throw new HttpError(502, "The payment provider rejected the request", "provider_error", { providerStatus: r.status });
  return json;
}
const toPaise = (rupees: unknown) => Math.round(Number(rupees) * 100);

const EVENT_MAP: Record<string, WebhookEventType> = {
  PAYMENT_SUCCESS_WEBHOOK: "payment.captured", PAYMENT_FAILED_WEBHOOK: "payment.failed",
  REFUND_STATUS_WEBHOOK: "refund.processed", DISPUTE_CREATED: "payment.disputed",
};

export const cashfreeProvider: PaymentProvider = {
  name: "cashfree",
  async createOrder({ amountPaise, receipt, customer }) {
    const o = await cf("/orders", { method: "POST", body: {
      order_id: `ek_${receipt}`, order_amount: Number((amountPaise / 100).toFixed(2)), order_currency: "INR",
      customer_details: { customer_id: customer?.id ?? receipt, customer_name: customer?.name, customer_email: customer?.email, customer_phone: "9999999999" }, // Cashfree requires a phone; we do not collect one
      // Cashfree production rejects non-https return URLs (e.g. localhost); the in-page modal does not need one.
      ...(env.WEB_ORIGIN.startsWith("https://") ? { order_meta: { return_url: `${env.WEB_ORIGIN}/account/orders/${receipt}` } } : {}),
    } });
    return { providerOrderId: o.order_id, checkout: { mode: env.CASHFREE_ENV, paymentSessionId: o.payment_session_id, providerOrderId: o.order_id, amountPaise, currency: "INR" } };
  },
  verifyCheckoutSignature: () => false, // not used: see fetchSuccessfulPayment
  async fetchSuccessfulPayment(providerOrderId) {
    const list = await cf(`/orders/${encodeURIComponent(providerOrderId)}/payments`, { method: "GET" });
    const p = Array.isArray(list) ? list.find((x: any) => x.payment_status === "SUCCESS") : null;
    return p ? { paymentId: String(p.cf_payment_id), amountPaise: toPaise(p.payment_amount) } : null;
  },
  verifyWebhookSignature(raw, h) {
    if (!env.CASHFREE_SECRET_KEY) return false;
    const ts = String(h["x-webhook-timestamp"] ?? "");
    if (!ts) return false;
    const expected = crypto.createHmac("sha256", env.CASHFREE_SECRET_KEY).update(ts).update(raw).digest("base64");
    return safeEqual(expected, String(h["x-webhook-signature"] ?? ""));
  },
  parseWebhook(body, h): ParsedWebhook | null {
    const type = EVENT_MAP[body?.type];
    const d = body?.data;
    const orderId = d?.order?.order_id;
    const paymentId = d?.payment?.cf_payment_id ?? d?.refund?.cf_payment_id;
    if (!type || !orderId || !paymentId) return null;
    if (type === "payment.captured" && d?.payment?.payment_status !== "SUCCESS") return null;
    if (type === "refund.processed" && d?.refund?.refund_status !== "SUCCESS") return null;
    return { eventId: `${body.type}:${paymentId}:${body.event_time ?? h["x-webhook-timestamp"] ?? ""}`, type, providerOrderId: String(orderId), paymentId: String(paymentId), amountPaise: toPaise(d?.payment?.payment_amount ?? d?.order?.order_amount) };
  },
  async refund() { throw new HttpError(501, "Refunds are issued from the Cashfree dashboard", "refund_unsupported"); },
};
