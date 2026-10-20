import { planById, type Plan } from "@ek/shared";
import type { Request } from "express";
import type { HydratedDocument } from "mongoose";
import { conflict, notFound } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { Entitlement, Order, Payment, PromoCode } from "../models/index.js";
import { audit } from "./audit.js";
import { getProvider } from "./payments/index.js";

/** Creates (idempotently) the entitlements an order pays for. Safe to call repeatedly. */
export async function ensureEntitlements(order: HydratedDocument<any>) {
  if (order.status !== "paid") return;
  for (const planId of order.planIds as string[]) {
    const plan = planById(planId) as Plan | undefined;
    if (!plan || plan.kind === "free") continue;
    const paidAt: Date = order.paidAt ?? new Date();
    const doc = {
      user: order.user, product: plan.product, planId, order: order._id, source: "purchase", status: "active",
      kind: plan.kind, creditsRemaining: plan.kind === "credits" ? plan.credits ?? 0 : 0, startsAt: paidAt,
      expiresAt: plan.kind === "period" ? new Date(paidAt.getTime() + (plan.periodDays ?? 30) * 86400_000) : null,
    };
    try { await Entitlement.updateOne({ order: order._id, planId }, { $setOnInsert: doc }, { upsert: true }); }
    catch (e: any) { if (e?.code !== 11000) throw e; }
  }
}

export type SettleResult = "paid" | "already_paid" | "amount_mismatch" | "unknown_order" | "refunded_ignored";

/**
 * The only place an order becomes "paid". Callers must have verified a signature first.
 * Atomic status transition guarantees exactly one winner under duplicate deliveries.
 */
export async function settlePayment(opts: { providerOrderId: string; paymentId: string; amountPaise: number; req?: Request }): Promise<SettleResult> {
  const order = await Order.findOne({ providerOrderId: opts.providerOrderId });
  if (!order) return "unknown_order";
  if (opts.amountPaise !== order.amountPaise) {
    await Payment.updateOne({ providerPaymentId: opts.paymentId }, { $setOnInsert: { order: order._id, provider: order.provider, providerPaymentId: opts.paymentId, amountPaise: opts.amountPaise, status: "amount_mismatch" } }, { upsert: true });
    await audit(opts.req ?? null, "payment.amount_mismatch", String(order._id), { expected: order.amountPaise, got: opts.amountPaise });
    logger.warn({ order: order.id }, "payment amount mismatch");
    return "amount_mismatch";
  }
  if (order.status === "refunded" || order.status === "disputed") return "refunded_ignored";

  const receiptNo = `EK-${new Date().getUTCFullYear()}-${String(order._id).slice(-8).toUpperCase()}`;
  const won = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ["pending", "failed", "cancelled"] } },
    { status: "paid", paidAt: new Date(), receiptNo, failureReason: null },
    { new: true },
  );
  await Payment.updateOne(
    { providerPaymentId: opts.paymentId },
    { $setOnInsert: { order: order._id, provider: order.provider, providerPaymentId: opts.paymentId, amountPaise: opts.amountPaise, status: "captured" } },
    { upsert: true },
  );
  const current = won ?? (await Order.findById(order._id));
  await ensureEntitlements(current!); // also repairs a crash between status flip and grant
  if (won?.promoCode) await PromoCode.updateOne({ code: won.promoCode }, { $inc: { uses: 1 } });
  if (won) await audit(opts.req ?? null, "payment.paid", String(order._id), { paymentId: opts.paymentId }, order.user);
  return won ? "paid" : "already_paid";
}

export async function markFailed(providerOrderId: string, reason: string) {
  await Order.updateOne({ providerOrderId, status: "pending" }, { status: "failed", failureReason: reason.slice(0, 200) });
}

export async function refundOrder(orderId: string, req: Request) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound("Order not found");
  if (order.status !== "paid") throw conflict("Only paid orders can be refunded");
  const pay = await Payment.findOne({ order: order._id, status: "captured" });
  if (!pay) throw conflict("No captured payment found for this order");
  const { refundId } = await getProvider().refund({ paymentId: pay.providerPaymentId, amountPaise: pay.amountPaise });
  await applyRefund(order._id.toString(), refundId);
  await audit(req, "admin.refund", orderId, { refundId });
}

/** Revokes access for a refunded order (policy: refunded orders lose the entitlement and downloads). */
export async function applyRefund(orderId: string, refundId?: string) {
  await Order.updateOne({ _id: orderId, status: { $in: ["paid", "disputed"] } }, { status: "refunded", refundedAt: new Date() });
  await Payment.updateOne({ order: orderId, status: "captured" }, { status: "refunded", refundId });
  await Entitlement.updateMany({ order: orderId }, { status: "refunded" });
}
export async function applyDispute(orderId: string) {
  await Order.updateOne({ _id: orderId, status: "paid" }, { status: "disputed" });
  await Entitlement.updateMany({ order: orderId, status: "active" }, { status: "suspended" });
}
