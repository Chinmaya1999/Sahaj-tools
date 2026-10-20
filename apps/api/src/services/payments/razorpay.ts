import { env } from "../../env.js";
import { hmac, safeEqual } from "../../lib/security.js";
import { HttpError } from "../../lib/http.js";
import type { ParsedWebhook, PaymentProvider, WebhookEventType } from "./provider.js";

/**
 * Razorpay adapter using the documented REST API (https://razorpay.com/docs/api/).
 * Signature schemes: checkout = HMAC_SHA256(order_id|payment_id, key_secret);
 * webhook = HMAC_SHA256(raw body, webhook_secret) in X-Razorpay-Signature.
 * Requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET. Not exercised against the
 * live sandbox in this repo's automated tests – see docs/payments.md.
 */
const need = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payments are not configured", "payments_unconfigured");
  return { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET };
};
async function rzp(path: string, init: { method: string; body?: unknown }) {
  const k = need();
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method,
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${k.id}:${k.secret}`).toString("base64")}` },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, "The payment provider rejected the request", "provider_error", { providerStatus: r.status });
  return json;
}

const EVENT_MAP: Record<string, WebhookEventType> = {
  "payment.captured": "payment.captured", "payment.failed": "payment.failed",
  "refund.processed": "refund.processed", "payment.dispute.created": "payment.disputed",
};

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",
  async createOrder({ amountPaise, receipt, notes }) {
    const o = await rzp("/orders", { method: "POST", body: { amount: amountPaise, currency: "INR", receipt, notes } });
    return { providerOrderId: o.id, checkout: { key: need().id, providerOrderId: o.id, amountPaise, currency: "INR" } };
  },
  verifyCheckoutSignature: ({ providerOrderId, paymentId, signature }) => safeEqual(hmac(need().secret, `${providerOrderId}|${paymentId}`), signature),
  async fetchPayment(paymentId) {
    const p = await rzp(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
    return { orderId: p.order_id, amountPaise: Number(p.amount), captured: p.status === "captured" };
  },
  verifyWebhookSignature(raw, h) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    return safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, raw), String(h["x-razorpay-signature"] ?? ""));
  },
  parseWebhook(body, h): ParsedWebhook | null {
    const type = EVENT_MAP[body?.event];
    const pay = body?.payload?.payment?.entity ?? body?.payload?.refund?.entity ?? body?.payload?.dispute?.entity;
    if (!type || !pay) return null;
    const paymentId = pay.payment_id ?? pay.id;
    const orderId = body?.payload?.payment?.entity?.order_id;
    if (!orderId || !paymentId) return null;
    return { eventId: String(h["x-razorpay-event-id"] ?? ""), type, providerOrderId: orderId, paymentId, amountPaise: Number(body?.payload?.payment?.entity?.amount ?? pay.amount) };
  },
  async refund({ paymentId, amountPaise }) {
    const r = await rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: { amount: amountPaise } });
    return { refundId: r.id };
  },
};
