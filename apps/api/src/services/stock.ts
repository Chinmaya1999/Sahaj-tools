import type { Types } from "mongoose";
import { conflict, notFound } from "../lib/http.js";
import { InventoryItem, StockMovement } from "../models/index.js";

/**
 * The only place MiniStock changes quantities. Rules enforced here:
 *  - every change writes an immutable StockMovement (who, why, how much, what it refers to);
 *  - decreases use a conditional atomic update on AVAILABLE stock (on hand - reserved), so two simultaneous sales
 *    can never oversell and stock can never go negative;
 *  - purchases re-average the unit cost in the same atomic update (weighted-average costing).
 */
export interface MoveOpts { type: "sale" | "purchase" | "sale_reversal" | "return_restock" | "stocktake" | "adjustment" | "damage" | "stock_in" | "stock_out"; reason?: string; note?: string; refType?: string; refId?: Types.ObjectId; actor?: Types.ObjectId; unitCostPaise?: number }

const AVAILABLE_AT_LEAST = (n: number) => ({ $expr: { $gte: [{ $subtract: ["$quantity", { $ifNull: ["$reserved", 0] }] }, n] } });

async function record(owner: Types.ObjectId, itemId: Types.ObjectId, delta: number, qtyAfter: number, o: MoveOpts) {
  return StockMovement.create({ owner, item: itemId, type: o.type, delta, qtyAfter, unitCostPaise: o.unitCostPaise, note: o.note, reason: o.reason, refType: o.refType, refId: o.refId, actor: o.actor });
}

/** Change on-hand stock by a signed whole number. Throws insufficient_stock (409) when a decrease would use stock that is not available. */
export async function moveStock(owner: Types.ObjectId, itemId: Types.ObjectId, delta: number, o: MoveOpts) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Stock change must be a non-zero whole number");
  let updated;
  if (delta < 0) {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner, ...AVAILABLE_AT_LEAST(-delta) }, { $inc: { quantity: delta } }, { new: true });
    if (!updated) await explainShortage(owner, itemId, -delta);
  } else if (o.unitCostPaise !== undefined) {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner }, [{ $set: {
      costPaise: { $round: [{ $divide: [{ $add: [{ $multiply: ["$quantity", "$costPaise"] }, delta * o.unitCostPaise] }, { $add: ["$quantity", delta] }] }, 0] },
      quantity: { $add: ["$quantity", delta] },
    } }], { new: true, updatePipeline: true });
  } else {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner }, { $inc: { quantity: delta } }, { new: true });
  }
  if (!updated) throw notFound("Product not found");
  const movement = await record(owner, itemId, delta, updated.quantity, o);
  return { item: updated, movement };
}

async function explainShortage(owner: Types.ObjectId, itemId: Types.ObjectId, requested: number): Promise<never> {
  const it = await InventoryItem.findOne({ _id: itemId, owner });
  if (!it) throw notFound("Product not found");
  const available = it.quantity - (it.reserved ?? 0);
  const e = conflict(`Not enough stock for ${it.name} (${it.sku}): requested ${requested}, available ${available}`, "INSUFFICIENT_STOCK") as any;
  e.extra = { requested, available, sku: it.sku, itemId: String(it._id) };
  throw e;
}

/** Promise stock to an order without moving it out of the shelf. */
export async function reserveStock(owner: Types.ObjectId, itemId: Types.ObjectId, qty: number) {
  const it = await InventoryItem.findOneAndUpdate({ _id: itemId, owner, ...AVAILABLE_AT_LEAST(qty) }, { $inc: { reserved: qty } }, { new: true });
  if (!it) await explainShortage(owner, itemId, qty);
}
export async function releaseStock(owner: Types.ObjectId, itemId: Types.ObjectId, qty: number) {
  const it = await InventoryItem.findOneAndUpdate({ _id: itemId, owner, reserved: { $gte: qty } }, { $inc: { reserved: -qty } }, { new: true });
  if (!it) throw conflict("Reserved stock does not match this order", "reservation_mismatch");
}
/** Dispatch: the reserved units leave the shelf (on hand and reserved both drop). Runs once per order (the order's stockState guards it). */
export async function shipReserved(owner: Types.ObjectId, itemId: Types.ObjectId, qty: number, o: MoveOpts) {
  const it = await InventoryItem.findOneAndUpdate({ _id: itemId, owner, reserved: { $gte: qty }, quantity: { $gte: qty } }, { $inc: { quantity: -qty, reserved: -qty } }, { new: true });
  if (!it) throw conflict("Reserved stock does not match this order", "reservation_mismatch");
  await record(owner, itemId, -qty, it.quantity, o);
}

export const availableOf = (i: { quantity: number; reserved?: number | null }) => i.quantity - (i.reserved ?? 0);

/** Collects undo steps so a half-finished multi-record operation can be reversed (MongoDB standalone servers have no transactions). */
export class Rollback {
  private steps: (() => Promise<unknown>)[] = [];
  add(fn: () => Promise<unknown>) { this.steps.unshift(fn); }
  async run() { for (const s of this.steps) { try { await s(); } catch { /* best effort; audit trail still has the movements */ } } this.steps = []; }
}
