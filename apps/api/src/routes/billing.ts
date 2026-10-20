import express, { Router, type Request } from "express";
import { z } from "zod";
import { PRODUCTS, checkoutSchema, type ProductSlug } from "@ek/shared";
import { env } from "../env.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, badRequest, forbidden, notFound, parse, wrap } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { Entitlement, Order, WebhookEvent } from "../models/index.js";
import { audit } from "../services/audit.js";
import { allAccess, spendCredit } from "../services/access.js";
import { applyDispute, applyRefund, ensureEntitlements, markFailed, settlePayment } from "../services/billing.js";
import { applyPromo, effectiveCatalog, priceFor } from "../services/catalog.js";
import { getProvider } from "../services/payments/index.js";
import { sandboxSign } from "../services/payments/sandbox.js";
import { randomToken } from "../lib/security.js";

export const catalogRouter = Router();
catalogRouter.get("/", wrap(async (_req, res) => {
  const c = await effectiveCatalog();
  res.json({ ...c, products: c.products.filter((p) => p.published), provider: getProvider().name });
}));

export const billingRouter = Router();
billingRouter.use(requireAuth);

const orderView = (o: any) => ({
  id: o.id, title: o.title, itemType: o.itemType, itemId: o.itemId, planIds: o.planIds, amountPaise: o.amountPaise, currency: o.currency,
  status: o.status, provider: o.provider, receiptNo: o.receiptNo, promoCode: o.promoCode, discountPaise: o.discountPaise, paidAt: o.paidAt, createdAt: o.createdAt, failureReason: o.failureReason,
});

billingRouter.post("/checkout", wrap(async (req, res) => {
  const { itemType, itemId, code } = parse(checkoutSchema, req.body); // the browser sends ids (and an optional code) – never a price
  const price = await priceFor(itemType, itemId);
  if (!price || !price.active) throw notFound("This item is not available for purchase");
  if (price.amountPaise < 100) throw badRequest("Invalid price configuration");
  const promo = await applyPromo(code, price.amountPaise);
  if (promo && !promo.ok) throw badRequest(promo.reason);
  const finalPaise = promo?.ok ? promo.finalPaise : price.amountPaise;
  const provider = getProvider();
  const order = await Order.create({ user: req.user!._id, itemType, itemId, title: price.title, planIds: price.planIds, amountPaise: finalPaise, listPricePaise: price.amountPaise, discountPaise: promo?.ok ? promo.discountPaise : 0, promoCode: promo?.ok ? promo.code : undefined, provider: provider.name });
  try {
    const created = await provider.createOrder({ amountPaise: finalPaise, receipt: order.id, notes: { orderId: order.id }, customer: { id: String(req.user!._id), name: req.user!.name, email: req.user!.email } });
    order.providerOrderId = created.providerOrderId; await order.save();
    await audit(req, "order.created", order.id, { itemType, itemId, amountPaise: finalPaise, promo: promo?.ok ? promo.code : undefined });
    res.status(201).json({ order: orderView(order), checkout: created.checkout, provider: provider.name, user: { name: req.user!.name, email: req.user!.email } });
  } catch (e) {
    order.status = "failed"; order.failureReason = "provider_unavailable"; await order.save();
    throw e;
  }
}));

/** Preview the price with a promo code (the real price is recomputed again at checkout). */
billingRouter.post("/promo", wrap(async (req, res) => {
  const { itemType, itemId, code } = parse(checkoutSchema, req.body);
  const price = await priceFor(itemType, itemId);
  if (!price || !price.active) throw notFound("This item is not available for purchase");
  const promo = await applyPromo(code, price.amountPaise);
  if (!promo) throw badRequest("Enter a code first");
  if (!promo.ok) throw badRequest(promo.reason);
  res.json({ code: promo.code, listPricePaise: price.amountPaise, discountPaise: promo.discountPaise, finalPaise: promo.finalPaise });
}));

/** Called by the browser after checkout with the provider's signed result. The signature is verified here. */
billingRouter.post("/verify", wrap(async (req, res) => {
  const b = parse(z.object({ orderId: z.string().length(24), paymentId: z.string().min(3).max(100).optional(), signature: z.string().min(10).max(200).optional() }), req.body);
  const order = await Order.findOne({ _id: b.orderId, user: req.user!._id });
  if (!order || !order.providerOrderId) throw notFound("Order not found");
  const provider = getProvider();
  let paymentId: string; let amount = order.amountPaise;
  if (provider.fetchSuccessfulPayment) { // no browser signature: the provider's own API is the source of truth
    const p = await provider.fetchSuccessfulPayment(order.providerOrderId);
    if (!p) throw new HttpError(409, "Payment is not captured yet. It will be applied automatically once confirmed.", "pending_capture");
    paymentId = p.paymentId; amount = p.amountPaise;
  } else {
    if (!b.paymentId || !b.signature || !provider.verifyCheckoutSignature({ providerOrderId: order.providerOrderId, paymentId: b.paymentId, signature: b.signature })) {
      await audit(req, "payment.bad_signature", order.id);
      throw new HttpError(400, "Payment could not be verified", "bad_signature");
    }
    paymentId = b.paymentId;
    if (provider.fetchPayment) {
      const p = await provider.fetchPayment(paymentId);
      if (!p || p.orderId !== order.providerOrderId || !p.captured) throw new HttpError(409, "Payment is not captured yet. It will be applied automatically once confirmed.", "pending_capture");
      amount = p.amountPaise;
    }
  }
  const result = await settlePayment({ providerOrderId: order.providerOrderId, paymentId, amountPaise: amount, req });
  const fresh = await Order.findById(order._id);
  res.json({ result, order: orderView(fresh) });
}));

billingRouter.post("/cancel", wrap(async (req, res) => {
  const { orderId } = parse(z.object({ orderId: z.string().length(24) }), req.body);
  await Order.updateOne({ _id: orderId, user: req.user!._id, status: "pending" }, { status: "cancelled" });
  const o = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!o) throw notFound("Order not found");
  res.json({ order: orderView(o) });
}));

billingRouter.get("/orders", wrap(async (req, res) => {
  const orders = await Order.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ orders: orders.map(orderView) });
}));
billingRouter.get("/orders/:id", wrap(async (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(String(req.params.id))) throw notFound("Order not found");
  const o = await Order.findOne({ _id: String(req.params.id), user: req.user!._id });
  if (!o) throw notFound("Order not found");
  if (o.status === "paid") await ensureEntitlements(o); // repairs any interrupted grant
  res.json({ order: orderView(o) });
}));

/** Development-only: simulates the hosted checkout of the sandbox provider. It signs like a real gateway would. */
billingRouter.post("/sandbox/complete", wrap(async (req, res) => {
  if (env.PAYMENT_PROVIDER !== "sandbox" || env.NODE_ENV === "production") throw forbidden("Sandbox checkout is disabled");
  const { orderId, outcome } = parse(z.object({ orderId: z.string().length(24), outcome: z.enum(["success", "fail", "cancel"]) }), req.body);
  const order = await Order.findOne({ _id: orderId, user: req.user!._id });
  if (!order?.providerOrderId) throw notFound("Order not found");
  if (outcome === "cancel") { await Order.updateOne({ _id: order._id, status: "pending" }, { status: "cancelled" }); return res.json({ outcome }); }
  if (outcome === "fail") { await markFailed(order.providerOrderId, "payment_declined"); return res.json({ outcome }); }
  const paymentId = `sbx_pay_${randomToken(8)}`;
  res.json({ outcome, paymentId, signature: sandboxSign(order.providerOrderId, paymentId) }); // browser then calls /verify like a real checkout
}));

/* ---------- webhook (mounted with a raw body parser) ---------- */
export const webhookHandler = [
  express.raw({ type: "*/*", limit: "256kb" }),
  wrap(async (req: Request, res) => {
    const provider = getProvider();
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!provider.verifyWebhookSignature(raw, req.headers)) {
      logger.warn("webhook rejected: invalid signature");
      await audit(req, "webhook.bad_signature");
      return res.status(400).json({ error: "invalid signature" });
    }
    let body: any;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "invalid body" }); }
    const ev = provider.parseWebhook(body, req.headers);
    if (!ev || !ev.eventId) return res.json({ ok: true, ignored: true });
    try { await WebhookEvent.create({ provider: provider.name, eventId: ev.eventId, type: ev.type }); }
    catch (e: any) { if (e?.code === 11000) return res.json({ ok: true, duplicate: true }); throw e; } // replay protection
    const order = await Order.findOne({ providerOrderId: ev.providerOrderId });
    if (!order) return res.json({ ok: true, ignored: true });
    switch (ev.type) {
      case "payment.captured": await settlePayment({ providerOrderId: ev.providerOrderId, paymentId: ev.paymentId, amountPaise: ev.amountPaise, req }); break;
      case "payment.failed": await markFailed(ev.providerOrderId, "payment_failed"); break;
      case "refund.processed": await applyRefund(order.id); await audit(req, "payment.refunded", order.id); break;
      case "payment.disputed": await applyDispute(order.id); await audit(req, "payment.disputed", order.id); break;
    }
    res.json({ ok: true });
  }),
];

/* ---------- entitlements & usage ---------- */
export const entitlementRouter = Router();
entitlementRouter.use(requireAuth);
entitlementRouter.get("/", wrap(async (req, res) => {
  const access = await allAccess(req.user!._id);
  res.json({ access: access.map((a) => ({ product: a.product, planIds: a.planIds, limits: a.limits, credits: a.credits, expiresAt: a.expiresAt, paid: a.paid })) });
}));
entitlementRouter.get("/library", wrap(async (req, res) => {
  const ents = await Entitlement.find({ user: req.user!._id }).sort({ createdAt: -1 }).lean();
  res.json({ entitlements: ents.map((e) => ({ id: String(e._id), product: e.product, planId: e.planId, kind: e.kind, creditsRemaining: e.creditsRemaining, expiresAt: e.expiresAt, status: e.status, startsAt: e.startsAt })) });
}));
entitlementRouter.post("/spend", wrap(async (req, res) => {
  const { product } = parse(z.object({ product: z.enum(["invitation"]) }), req.body); // only products whose output is produced in the browser
  if (!PRODUCTS.some((p) => p.slug === (product as ProductSlug))) throw badRequest("Unknown product");
  if (!(await spendCredit(req.user!._id, product))) throw new HttpError(402, "No clean-download credits left", "upgrade_required", { product });
  const a = await allAccess(req.user!._id);
  res.json({ ok: true, credits: a.find((x) => x.product === product)?.credits ?? 0 });
}));

