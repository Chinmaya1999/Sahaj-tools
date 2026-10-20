import { Types } from "mongoose";
import { calcSale, canMove, orderOutstanding, type OrderInput, type OrderStatus } from "@ek/shared";
import { z } from "zod";
import type { returnInputSchema } from "@ek/shared";
import { HttpError, badRequest, conflict, notFound } from "../lib/http.js";
import { Counter, Customer, InventoryItem, SaleOrder, SalePayment, SaleReturn } from "../models/index.js";
import { Rollback, moveStock, releaseStock, reserveStock, shipReserved } from "./stock.js";

type Owner = Types.ObjectId;
const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
export const nextNumber = async (owner: Owner, key: string, prefix: string) => {
  const c = await Counter.findOneAndUpdate({ owner, key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${String(c.seq).padStart(4, "0")}`;
};

export function orderView(o: any) {
  return {
    id: String(o._id), number: o.number, status: o.status as OrderStatus, stockState: o.stockState, channel: o.channel,
    customer: o.customer ? String(o.customer) : null, customerName: o.customerName || "Walk-in customer",
    lines: o.lines.map((l: any) => ({ itemId: String(l.item), sku: l.sku, name: l.name, quantity: l.quantity, returnedQty: l.returnedQty ?? 0, unitPricePaise: l.unitPricePaise, discountPaise: l.discountPaise, taxPercent: l.taxPercent, taxablePaise: l.taxablePaise, taxPaise: l.taxPaise, totalPaise: l.totalPaise })),
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, taxPaise: o.taxPaise, shippingPaise: o.shippingPaise, totalPaise: o.totalPaise,
    paidPaise: o.paidPaise, refundedPaise: o.refundedPaise, returnedValuePaise: o.returnedValuePaise,
    outstandingPaise: o.status === "cancelled" || o.status === "draft" ? 0 : Math.max(0, orderOutstanding(o)),
    creditDuePaise: o.status === "cancelled" ? 0 : Math.max(0, -orderOutstanding(o)),
    cod: o.cod, courier: o.courier, tracking: o.tracking, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, notes: o.notes, cancelReason: o.cancelReason,
    history: o.history, createdAt: o.createdAt,
  };
}
export const paymentView = (p: any) => ({ id: String(p._id), orderId: String(p.order), kind: p.kind, method: p.method, amountPaise: p.amountPaise, status: p.status, reference: p.reference, verifiedByGateway: p.verifiedByGateway, paidAt: p.paidAt, createdAt: p.createdAt });

async function undoLines(owner: Owner, done: { item: Types.ObjectId; qty: number }[], mode: "deducted" | "reserved", orderId: Types.ObjectId, actor: Owner) {
  for (const d of done) {
    if (mode === "deducted") await moveStock(owner, d.item, d.qty, { type: "sale_reversal", reason: "rollback", refType: "order", refId: orderId, actor });
    else await releaseStock(owner, d.item, d.qty);
  }
}

/* =========================== create ============================ */
export async function createOrder(owner: Owner, actor: Owner, input: OrderInput) {
  if (input.key) {
    const dup = await SaleOrder.findOne({ owner, idempotencyKey: input.key });
    if (dup) return { order: dup, replayed: true };
  }
  const ids = input.lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) throw badRequest("The same product appears on more than one line. Combine them into one line.");
  const items = await InventoryItem.find({ _id: { $in: ids.map(oid) }, owner });
  const byId = new Map(items.map((i) => [String(i._id), i]));
  for (const l of input.lines) {
    const it = byId.get(l.itemId);
    if (!it) throw notFound("A product on this order no longer exists");
    if (it.archived) throw badRequest(`${it.name} (${it.sku}) is archived and cannot be sold`);
  }
  let customerName = "";
  if (input.customerId) {
    const c = await Customer.findOne({ _id: input.customerId, owner });
    if (!c) throw notFound("Customer not found");
    customerName = c.name;
  }
  let totals;
  try {
    totals = calcSale(input.lines.map((l) => { const it = byId.get(l.itemId)!; return { quantity: l.quantity, unitPricePaise: l.unitPricePaise ?? it.pricePaise, discountPaise: l.discountPaise, taxPercent: it.taxPercent ?? 0 }; }), input.discountPaise, input.shippingPaise);
  } catch (e: any) { throw badRequest(e.message); }
  if (input.draft && input.payments.length) throw badRequest("A draft cannot take payments. Confirm the order first.");
  const confirmedNow = input.payments.filter((p) => p.status === "confirmed").reduce((a, p) => a + p.amountPaise, 0);
  if (confirmedNow > totals.totalPaise) throw conflict(`Payment (${confirmedNow}) is more than the order total (${totals.totalPaise})`, "OVERPAYMENT");

  const status: OrderStatus = input.draft ? "draft" : input.fulfilment === "now" ? "delivered" : "confirmed";
  const lines = input.lines.map((l, i) => { const it = byId.get(l.itemId)!; const t = totals.lines[i]; return { item: it._id, sku: it.sku, name: it.name, quantity: l.quantity, unitPricePaise: l.unitPricePaise ?? it.pricePaise, discountPaise: l.discountPaise, orderDiscountSharePaise: t.orderDiscountSharePaise, taxPercent: it.taxPercent ?? 0, taxablePaise: t.taxablePaise, taxPaise: t.taxPaise, totalPaise: t.totalPaise, unitCostPaise: it.costPaise, returnedQty: 0 }; });
  const now = new Date();
  let order;
  try {
    order = await SaleOrder.create({
      owner, number: await nextNumber(owner, "sale", "S"), idempotencyKey: input.key, customer: input.customerId ?? null, customerName, channel: input.channel, status, stockState: "none", lines,
      subtotalPaise: totals.subtotalPaise, discountPaise: totals.orderDiscountPaise, taxablePaise: totals.taxablePaise, taxPaise: totals.taxPaise, shippingPaise: totals.shippingPaise, totalPaise: totals.totalPaise,
      cod: input.cod, notes: input.notes, createdBy: actor, deliveredAt: status === "delivered" ? now : undefined, history: [{ status, at: now, by: actor }],
    });
  } catch (e: any) {
    if (e?.code === 11000 && input.key) { const dup = await SaleOrder.findOne({ owner, idempotencyKey: input.key }); if (dup) return { order: dup, replayed: true }; }
    throw e;
  }

  // Stock effects. If any step fails everything done so far is reversed and the half-created order removed.
  const done: { item: Types.ObjectId; qty: number }[] = [];
  const costs = new Map<string, number>();
  try {
    if (status === "delivered") {
      for (const l of lines) { const r = await moveStock(owner, l.item, -l.quantity, { type: "sale", refType: "order", refId: order._id, actor, reason: order.number }); done.push({ item: l.item, qty: l.quantity }); costs.set(String(l.item), r.item.costPaise); }
      order.stockState = "deducted";
    } else if (status === "confirmed") {
      for (const l of lines) { await reserveStock(owner, l.item, l.quantity); done.push({ item: l.item, qty: l.quantity }); }
      order.stockState = "reserved";
    }
    if (costs.size) order.lines.forEach((l: any) => { const c = costs.get(String(l.item)); if (c !== undefined) l.unitCostPaise = c; });
    await order.save();
    for (const p of input.payments) await recordPayment(owner, actor, order._id, p);
  } catch (e) {
    if (order.stockState === "deducted" || (status === "delivered" && done.length)) await undoLines(owner, done, "deducted", order._id, actor);
    else if (done.length) await undoLines(owner, done, "reserved", order._id, actor);
    await SalePayment.deleteMany({ owner, order: order._id });
    await SaleOrder.deleteOne({ _id: order._id });
    throw e;
  }
  return { order: (await SaleOrder.findById(order._id))!, replayed: false };
}

/* =========================== payments ============================ */
export async function recordPayment(owner: Owner, actor: Owner, orderId: Types.ObjectId | string, p: { method: string; amountPaise: number; reference?: string; status?: "confirmed" | "pending" }) {
  const order = await SaleOrder.findOne({ _id: oid(orderId), owner });
  if (!order) throw notFound("Order not found");
  if (order.status === "draft" || order.status === "cancelled") throw conflict(`A ${order.status} order cannot take payments`, "ORDER_NOT_PAYABLE");
  const status = p.status ?? "confirmed";
  let doc;
  try {
    doc = await SalePayment.create({ owner, order: order._id, customer: order.customer, kind: "payment", method: p.method, amountPaise: p.amountPaise, status, reference: p.reference || undefined, recordedBy: actor, paidAt: status === "confirmed" ? new Date() : undefined, verifiedByGateway: false });
  } catch (e: any) { if (e?.code === 11000) throw conflict("This payment reference was already recorded for this order", "DUPLICATE_PAYMENT"); throw e; }
  if (status === "confirmed") { try { await applyConfirmedPaymentKeep(owner, doc); } catch (e) { await SalePayment.deleteOne({ _id: doc._id }); throw e; } }
  return doc;
}
/** Pending → confirmed exactly once. A repeated call (or repeated gateway callback) cannot add the money twice. */
export async function confirmPayment(owner: Owner, paymentId: string) {
  if (!Types.ObjectId.isValid(paymentId)) throw notFound("Payment not found");
  const claimed = await SalePayment.findOneAndUpdate({ _id: paymentId, owner, status: "pending" }, { status: "confirmed", paidAt: new Date() }, { new: true });
  if (!claimed) { const ex = await SalePayment.findOne({ _id: paymentId, owner }); if (!ex) throw notFound("Payment not found"); return ex; }
  try {
    if (claimed.kind === "payment") await applyConfirmedPaymentKeep(owner, claimed);
    else {
      const ok = await SaleOrder.findOneAndUpdate({ _id: claimed.order, owner, $expr: { $lte: [{ $add: ["$refundedPaise", claimed.amountPaise] }, "$paidPaise"] } }, { $inc: { refundedPaise: claimed.amountPaise } });
      if (!ok) throw conflict("This refund is more than the money received on the order", "OVERREFUND");
    }
  } catch (e) { await SalePayment.updateOne({ _id: claimed._id }, { status: "pending", $unset: { paidAt: 1 } }); throw e; }
  return claimed;
}
async function applyConfirmedPaymentKeep(owner: Owner, doc: any) {
  const ok = await SaleOrder.findOneAndUpdate(
    { _id: doc.order, owner, $expr: { $lte: [{ $add: [{ $subtract: ["$paidPaise", "$refundedPaise"] }, doc.amountPaise] }, { $subtract: ["$totalPaise", "$returnedValuePaise"] }] } },
    { $inc: { paidPaise: doc.amountPaise } });
  if (!ok) throw conflict("That payment is more than the amount still owed on this order", "OVERPAYMENT");
}
export async function failPayment(owner: Owner, paymentId: string) {
  if (!Types.ObjectId.isValid(paymentId)) throw notFound("Payment not found");
  const r = await SalePayment.findOneAndUpdate({ _id: paymentId, owner, status: "pending" }, { status: "failed" }, { new: true });
  if (!r) throw conflict("Only a pending payment can be marked failed", "NOT_PENDING");
  return r;
}

/* =========================== lifecycle ============================ */
async function loadOrder(owner: Owner, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Order not found");
  const o = await SaleOrder.findOne({ _id: id, owner });
  if (!o) throw notFound("Order not found");
  return o;
}
const invalidMove = (from: string, to: string) => conflict(`An order cannot go from ${from} to ${to}`, "INVALID_TRANSITION");
const push = (status: string, actor: Owner, note?: string) => ({ $push: { history: { status, at: new Date(), by: actor, note } } });

export async function moveOrder(owner: Owner, actor: Owner, id: string, to: OrderStatus, extra: { courier?: string; tracking?: string; scans?: string[] } = {}) {
  const order = await loadOrder(owner, id);
  if (!canMove(order.status as OrderStatus, to)) throw invalidMove(order.status, to);
  const from = order.status as OrderStatus;

  if (to === "confirmed") {
    const claimed = await SaleOrder.findOneAndUpdate({ _id: order._id, status: "draft" }, { status: "confirmed", ...push("confirmed", actor) });
    if (!claimed) throw invalidMove("draft", to);
    const done: { item: Types.ObjectId; qty: number }[] = [];
    try { for (const l of order.lines) { await reserveStock(owner, l.item, l.quantity!); done.push({ item: l.item, qty: l.quantity! }); } }
    catch (e) { await undoLines(owner, done, "reserved", order._id, actor); await SaleOrder.updateOne({ _id: order._id }, { status: "draft" }); throw e; }
    await SaleOrder.updateOne({ _id: order._id }, { stockState: "reserved" });
  } else if (to === "packed") {
    if (extra.scans?.length) verifyScans(order, extra.scans, await InventoryItem.find({ _id: { $in: order.lines.map((l: any) => l.item) }, owner }));
    const r = await SaleOrder.findOneAndUpdate({ _id: order._id, status: "confirmed" }, { status: "packed", packedAt: new Date(), ...push("packed", actor) });
    if (!r) throw invalidMove(from, to);
  } else if (to === "shipped") {
    const r = await SaleOrder.findOneAndUpdate({ _id: order._id, status: "packed", stockState: "reserved" }, { status: "shipped", stockState: "deducted", shippedAt: new Date(), courier: extra.courier, tracking: extra.tracking, ...push("shipped", actor, extra.tracking) });
    if (!r) throw invalidMove(from, to);
    // The claim above guarantees stock leaves the shelf once, however many times Ship is pressed.
    const costs = new Map<string, number>();
    for (const l of r.lines) {
      const it = await InventoryItem.findById(l.item);
      await shipReserved(owner, l.item, l.quantity!, { type: "sale", refType: "order", refId: order._id, actor, reason: order.number });
      costs.set(String(l.item), it?.costPaise ?? l.unitCostPaise ?? 0);
    }
    for (const l of r.lines) await SaleOrder.updateOne({ _id: order._id, "lines.item": l.item }, { $set: { "lines.$.unitCostPaise": costs.get(String(l.item)) } });
  } else if (to === "delivered") {
    const r = await SaleOrder.findOneAndUpdate({ _id: order._id, status: "shipped" }, { status: "delivered", deliveredAt: new Date(), ...push("delivered", actor) });
    if (!r) throw invalidMove(from, to);
  }
  return (await SaleOrder.findById(order._id))!;
}

/** Scan verification at packing: catches wrong variants, missing items and extra scans. */
function verifyScans(order: any, scans: string[], items: any[]) {
  const code = new Map<string, string>();
  for (const it of items) { code.set(it.sku.toLowerCase(), String(it._id)); if (it.barcode) code.set(String(it.barcode).toLowerCase(), String(it._id)); }
  const scanned = new Map<string, number>(); const unknown: string[] = [];
  for (const s of scans) { const id = code.get(s.trim().toLowerCase()); if (!id) unknown.push(s); else scanned.set(id, (scanned.get(id) ?? 0) + 1); }
  const missing: any[] = [], extra: any[] = [];
  for (const l of order.lines) { const n = scanned.get(String(l.item)) ?? 0; if (n < l.quantity) missing.push({ sku: l.sku, missing: l.quantity - n }); if (n > l.quantity) extra.push({ sku: l.sku, extra: n - l.quantity }); scanned.delete(String(l.item)); }
  const wrong = [...scanned.keys()].map((id) => items.find((i) => String(i._id) === id)?.sku ?? id);
  if (unknown.length || missing.length || extra.length || wrong.length) {
    const e = new HttpError(422, "The scanned items do not match this order", "PACK_MISMATCH", { missing, extra, wrongVariant: wrong, unknown });
    throw e;
  }
}

/** Cancels exactly once. Reservations are released, shipped stock is restored through a recorded reversal, and money already received becomes a pending refund. */
export async function cancelOrder(owner: Owner, actor: Owner, id: string, reason: string) {
  const order = await loadOrder(owner, id);
  const prev = await SaleOrder.findOneAndUpdate(
    { _id: order._id, owner, status: { $nin: ["cancelled", "returned", "partially_returned"] }, lines: { $not: { $elemMatch: { returnedQty: { $gt: 0 } } } } },
    { status: "cancelled", cancelledAt: new Date(), cancelReason: reason, ...push("cancelled", actor, reason) });
  if (!prev) throw conflict(order.status === "cancelled" ? "This order is already cancelled" : "This order has returns or cannot be cancelled. Use a return instead.", "CANNOT_CANCEL");
  if (prev.stockState === "reserved") {
    for (const l of prev.lines) await releaseStock(owner, l.item, l.quantity!);
    await SaleOrder.updateOne({ _id: prev._id }, { stockState: "released" });
  } else if (prev.stockState === "deducted") {
    for (const l of prev.lines) await moveStock(owner, l.item, l.quantity!, { type: "sale_reversal", reason: `Cancelled ${prev.number}`, refType: "order", refId: prev._id, actor });
    await SaleOrder.updateOne({ _id: prev._id }, { stockState: "restored" });
  }
  await SalePayment.updateMany({ owner, order: prev._id, kind: "payment", status: "pending" }, { status: "failed" });
  const net = prev.paidPaise - prev.refundedPaise;
  if (net > 0) await SalePayment.create({ owner, order: prev._id, customer: prev.customer, kind: "refund", method: "cash", amountPaise: net, status: "pending", reference: `cancel-${prev.number}`, recordedBy: actor });
  return (await SaleOrder.findById(prev._id))!;
}

/* =========================== returns ============================ */
export async function createReturn(owner: Owner, actor: Owner, input: z.infer<typeof returnInputSchema>) {
  if (input.key) { const dup = await SaleReturn.findOne({ owner, idempotencyKey: input.key }); if (dup) return { ret: dup, replayed: true }; }
  const order = await loadOrder(owner, input.orderId);
  if (order.stockState !== "deducted" || !["shipped", "delivered", "partially_returned"].includes(order.status)) throw conflict("Only items that have left the shop can be returned", "NOT_RETURNABLE");
  const seen = new Set<string>();
  const lines = input.lines.map((l) => {
    if (seen.has(l.itemId)) throw badRequest("The same product appears twice in this return");
    seen.add(l.itemId);
    const ol: any = order.lines.find((x: any) => String(x.item) === l.itemId);
    if (!ol) throw badRequest("A returned product was not on the original order");
    if (l.quantity > ol.quantity - (ol.returnedQty ?? 0)) throw conflict(`Only ${ol.quantity - (ol.returnedQty ?? 0)} of ${ol.name} can still be returned`, "RETURN_EXCEEDS_SOLD");
    const refund = Math.round((ol.totalPaise * l.quantity) / ol.quantity);
    const taxable = Math.round((ol.taxablePaise * l.quantity) / ol.quantity);
    return { item: ol.item, sku: ol.sku, name: ol.name, quantity: l.quantity, reason: l.reason, condition: l.condition, note: l.note, unitRefundPaise: refund, unitTaxablePaise: taxable, unitCostPaise: ol.unitCostPaise, restocked: false, _total: refund };
  });
  const returnedValue = lines.reduce((a, l) => a + l._total, 0);
  // Only money the customer has now OVERPAID can be refunded. A credit-sale customer who has not paid for the returned goods gets a lower balance, not cash.
  const netReceived = order.paidPaise - order.refundedPaise;
  const refundCap = Math.max(0, Math.min(returnedValue, netReceived - (order.totalPaise! - order.returnedValuePaise - returnedValue)));
  const wanted = input.refund ? (input.refund.amountPaise ?? refundCap) : 0;
  if (wanted > refundCap) throw conflict(`The refund cannot be more than ${refundCap} paise (the amount the customer has overpaid after this return)`, "REFUND_TOO_HIGH");

  let ret;
  try { ret = await SaleReturn.create({ owner, number: await nextNumber(owner, "return", "R"), order: order._id, idempotencyKey: input.key, lines: lines.map(({ _total, ...l }) => l), returnedValuePaise: returnedValue, refundDuePaise: Math.max(0, refundCap - wanted), createdBy: actor }); }
  catch (e: any) { if (e?.code === 11000 && input.key) { const dup = await SaleReturn.findOne({ owner, idempotencyKey: input.key }); if (dup) return { ret: dup, replayed: true }; } throw e; }

  const rb = new Rollback();
  try {
    for (const l of lines) {
      const r = await SaleOrder.updateOne({ _id: order._id, owner }, { $inc: { "lines.$[l].returnedQty": l.quantity } }, { arrayFilters: [{ "l.item": l.item, "l.returnedQty": { $lte: (order.lines.find((x: any) => String(x.item) === String(l.item)) as any).quantity - l.quantity } }] });
      if (r.modifiedCount !== 1) throw conflict(`Only part of ${l.name} can still be returned`, "RETURN_EXCEEDS_SOLD");
      rb.add(() => SaleOrder.updateOne({ _id: order._id }, { $inc: { "lines.$[l].returnedQty": -l.quantity } }, { arrayFilters: [{ "l.item": l.item }] }));
    }
    for (const [i, l] of lines.entries()) {
      if (l.condition === "restockable") {
        await moveStock(owner, l.item, l.quantity, { type: "return_restock", reason: `Return ${ret.number}`, refType: "return", refId: ret._id, actor });
        await SaleReturn.updateOne({ _id: ret._id }, { $set: { [`lines.${i}.restocked`]: true } });
      }
    }
    const after = await SaleOrder.findOneAndUpdate({ _id: order._id }, { $inc: { returnedValuePaise: returnedValue } }, { new: true });
    const all = after!.lines.every((l: any) => (l.returnedQty ?? 0) >= l.quantity);
    await SaleOrder.updateOne({ _id: order._id }, { status: all ? "returned" : "partially_returned", ...push(all ? "returned" : "partially_returned", actor, ret.number ?? undefined) });
    if (input.refund && wanted > 0) {
      const ok = await SaleOrder.findOneAndUpdate({ _id: order._id, $expr: { $lte: [{ $add: ["$refundedPaise", wanted] }, "$paidPaise"] } }, { $inc: { refundedPaise: wanted } });
      if (!ok) throw conflict("The refund is more than the money received on this order", "OVERREFUND");
      await SalePayment.create({ owner, order: order._id, customer: order.customer, kind: "refund", method: input.refund.method, amountPaise: wanted, status: "confirmed", reference: `return-${ret.number}`, recordedBy: actor, paidAt: new Date(), returnId: ret._id });
    }
  } catch (e) {
    await rb.run(); await SaleReturn.deleteOne({ _id: ret._id });
    throw e;
  }
  return { ret: (await SaleReturn.findById(ret._id))!, replayed: false };
}

/** A pending-inspection line is decided once: restockable adds stock back, damaged does not. A refund never decides this. */
export async function inspectReturn(owner: Owner, actor: Owner, id: string, decisions: { index: number; condition: "restockable" | "damaged" }[]) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Return not found");
  const ret = await SaleReturn.findOne({ _id: id, owner });
  if (!ret) throw notFound("Return not found");
  for (const d of decisions) {
    const line: any = ret.lines[d.index];
    if (!line) throw badRequest(`There is no line ${d.index}`);
    const r = await SaleReturn.updateOne({ _id: ret._id, [`lines.${d.index}.condition`]: "pending" }, { $set: { [`lines.${d.index}.condition`]: d.condition, [`lines.${d.index}.restocked`]: d.condition === "restockable" } });
    if (r.modifiedCount !== 1) throw conflict(`Line ${d.index + 1} was already inspected`, "ALREADY_INSPECTED");
    if (d.condition === "restockable") await moveStock(owner, line.item, line.quantity, { type: "return_restock", reason: `Inspected ${ret.number}`, refType: "return", refId: ret._id, actor });
  }
  return (await SaleReturn.findById(ret._id))!;
}

export const returnView = (r: any) => ({ id: String(r._id), number: r.number, orderId: String(r.order), lines: r.lines.map((l: any, i: number) => ({ index: i, itemId: String(l.item), sku: l.sku, name: l.name, quantity: l.quantity, reason: l.reason, condition: l.condition, restocked: l.restocked })), returnedValuePaise: r.returnedValuePaise, refundDuePaise: r.refundDuePaise, createdAt: r.createdAt });
