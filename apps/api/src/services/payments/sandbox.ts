import crypto from "node:crypto";
import { env } from "../../env.js";
import { hmac, safeEqual } from "../../lib/security.js";
import type { ParsedWebhook, PaymentProvider } from "./provider.js";

/**
 * Local sandbox gateway for development and automated tests. It mimics a real provider's
 * signing scheme (HMAC-SHA256) so the verification code path is exercised for real.
 * It is blocked in production by env.ts.
 */
export const sandboxSign = (providerOrderId: string, paymentId: string) => hmac(env.SANDBOX_PAYMENT_SECRET, `${providerOrderId}|${paymentId}`);
export const sandboxWebhookSign = (raw: string | Buffer) => hmac(env.SANDBOX_PAYMENT_SECRET, raw);

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  async createOrder({ amountPaise }) {
    const providerOrderId = `sbx_order_${crypto.randomBytes(8).toString("hex")}`;
    return { providerOrderId, checkout: { sandbox: true, providerOrderId, amountPaise } };
  },
  verifyCheckoutSignature: ({ providerOrderId, paymentId, signature }) => safeEqual(sandboxSign(providerOrderId, paymentId), signature),
  verifyWebhookSignature: (raw, h) => safeEqual(sandboxWebhookSign(raw), String(h["x-sandbox-signature"] ?? "")),
  parseWebhook(body, h): ParsedWebhook | null {
    if (!body?.type || !body?.providerOrderId || !body?.paymentId) return null;
    return { eventId: String(h["x-sandbox-event-id"] ?? body.eventId ?? ""), type: body.type, providerOrderId: body.providerOrderId, paymentId: body.paymentId, amountPaise: Number(body.amountPaise) };
  },
  async refund({ paymentId }) { return { refundId: `sbx_refund_${paymentId}` }; },
};
