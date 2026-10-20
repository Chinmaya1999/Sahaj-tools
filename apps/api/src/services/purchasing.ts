import { Types } from "mongoose";
import { suggestReorder } from "@ek/shared";
import type { purchaseOrderSchema, receiveSchema } from "@ek/shared";
import type { z } from "zod";
import { badRequest, conflict, notFound } from "../lib/http.js";
import { InventoryItem, PurchaseOrder, StockMovement, Supplier } from "../models/index.js";
import { nextNumber } from "./sales.js";
import { moveStock } from "./stock.js";

type Owner = Types.ObjectId;
const oid = (id: string) => new Types.ObjectId(id);

export const poView = (p: any) => {
  const receivedValue = p.receivedValuePaise ?? 0;
  return {
    id: String(p._id), number: p.number, supplierId: String(p.supplier), supplierName: p.supplierName, status: p.status, expectedDate: p.expectedDate, notes: p.notes, supplierInvoice: p.supplierInvoice,
    lines: p.lines.map((l: any) => ({ itemId: String(l.item), sku: l.sku, name: l.name, orderedQty: l.orderedQty, acceptedQty: l.acceptedQty, rejectedQty: l.rejectedQty, outstandingQty: l.orderedQty - l.acceptedQty - l.rejectedQty, unitCostPaise: l.unitCostPaise })),
    totalPaise: p.totalPaise, receivedValuePaise: receivedValue, paidPaise: p.paidPaise, balancePaise: receivedValue - p.paidPaise, dueDate: p.dueDate,
    receipts: (p.receipts ?? []).map((r: any) => ({ at: r.at, supplierInvoice: r.supplierInvoice, lines: r.lines })), payments: p.payments, createdAt: p.createdAt,
  };
};

export async function createPurchaseOrder(owner: Owner, input: z.infer<typeof purchaseOrderSchema>) {
  const sup = await Supplier.findOne({ _id: input.supplierId, owner });
  if (!sup) throw notFound("Supplier not found");
  const ids = input.lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) throw badRequest("The same product appears on more than one line");
  const items = await InventoryItem.find({ _id: { $in: ids.map(oid) }, owner });
  if (items.length !== ids.length) throw notFound("A product on this purchase order no longer exists");
  const by = new Map(items.map((i) => [String(i._id), i]));
  const lines = input.lines.map((l) => { const it = by.get(l.itemId)!; return { item: it._id, sku: it.sku, name: it.name, orderedQty: l.quantity, acceptedQty: 0, rejectedQty: 0, unitCostPaise: l.unitCostPaise }; });
  // A purchase order alone never changes stock. Stock rises only when goods are received.
  return PurchaseOrder.create({ owner, number: await nextNumber(owner, "po", "PO"), supplier: sup._id, supplierName: sup.name, status: input.status, expectedDate: input.expectedDate ?? undefined, notes: input.notes, lines, totalPaise: lines.reduce((a, l) => a + l.orderedQty * l.unitCostPaise, 0) });
}

export async function receiveGoods(owner: Owner, actor: Owner, id: string, input: z.infer<typeof receiveSchema>) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Purchase order not found");
  const po = await PurchaseOrder.findOne({ _id: id, owner });
  if (!po) throw notFound("Purchase order not found");
  if (po.receipts.some((r: any) => r.key === input.key)) return { po, replayed: true };
  if (!["ordered", "partially_received"].includes(po.status)) throw conflict(`A ${po.status} purchase order cannot receive goods`, "PO_NOT_RECEIVABLE");
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.itemId)) throw badRequest("The same product appears twice in this delivery");
    seen.add(l.itemId);
    const pl: any = po.lines.find((x: any) => String(x.item) === l.itemId);
    if (!pl) throw badRequest("A delivered product is not on this purchase order");
    const outstanding = pl.orderedQty - pl.acceptedQty - pl.rejectedQty;
    if (l.accepted + l.rejected > outstanding) throw conflict(`${pl.name}: only ${outstanding} still expected, but ${l.accepted + l.rejected} recorded`, "OVER_RECEIPT");
  }
  const inc: Record<string, number> = {}; const arrayFilters: Record<string, unknown>[] = [];
  let value = 0;
  input.lines.forEach((l, i) => { const pl: any = po.lines.find((x: any) => String(x.item) === l.itemId); inc[`lines.$[f${i}].acceptedQty`] = l.accepted; inc[`lines.$[f${i}].rejectedQty`] = l.rejected; arrayFilters.push({ [`f${i}.item`]: pl.item }); value += l.accepted * pl.unitCostPaise; });
  const next = po.lines.map((pl: any) => { const l = input.lines.find((x) => x.itemId === String(pl.item)); return pl.acceptedQty + pl.rejectedQty + (l ? l.accepted + l.rejected : 0) >= pl.orderedQty; });
  const status = next.every(Boolean) ? "received" : "partially_received";
  const sup = await Supplier.findById(po.supplier);
  const due = new Date(Date.now() + (sup?.paymentTermsDays ?? 0) * 86400_000);
  // Optimistic claim: succeeds only if nobody else changed this PO and this delivery key is new, so a double submit or retry cannot receive twice.
  const claimed = await PurchaseOrder.findOneAndUpdate(
    { _id: po._id, owner, rev: po.rev, "receipts.key": { $ne: input.key } },
    { $inc: { ...inc, receivedValuePaise: value, rev: 1 }, $set: { status, dueDate: due, ...(input.supplierInvoice ? { supplierInvoice: input.supplierInvoice } : {}) }, $push: { receipts: { key: input.key, at: new Date(), by: actor, supplierInvoice: input.supplierInvoice, lines: input.lines.map((l) => ({ item: oid(l.itemId), accepted: l.accepted, rejected: l.rejected, note: l.note })) } } },
    { new: true, arrayFilters });
  if (!claimed) {
    const again = await PurchaseOrder.findOne({ _id: po._id, owner });
    if (again?.receipts.some((r: any) => r.key === input.key)) return { po: again, replayed: true };
    throw conflict("This purchase order just changed. Reload it and try again.", "PO_CHANGED");
  }
  // Only the accepted quantity enters stock (weighted-average cost). Rejected goods never do.
  for (const l of input.lines) {
    if (l.accepted > 0) { const pl: any = po.lines.find((x: any) => String(x.item) === l.itemId); await moveStock(owner, pl.item, l.accepted, { type: "purchase", unitCostPaise: pl.unitCostPaise, refType: "purchase_order", refId: po._id, actor, reason: `${po.number}${input.supplierInvoice ? " / " + input.supplierInvoice : ""}`, note: l.note }); }
  }
  return { po: claimed, replayed: false };
}

export async function paySupplier(owner: Owner, actor: Owner, id: string, p: { amountPaise: number; method: string; reference?: string }) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Purchase order not found");
  const r = await PurchaseOrder.findOneAndUpdate(
    { _id: id, owner, status: { $ne: "cancelled" }, $expr: { $lte: [{ $add: ["$paidPaise", p.amountPaise] }, "$totalPaise"] } },
    { $inc: { paidPaise: p.amountPaise }, $push: { payments: { amountPaise: p.amountPaise, method: p.method, reference: p.reference, at: new Date(), by: actor } } }, { new: true });
  if (!r) { if (!(await PurchaseOrder.exists({ _id: id, owner }))) throw notFound("Purchase order not found"); throw conflict("That payment is more than the purchase order total", "OVERPAYMENT"); }
  return r;
}

export async function cancelPurchaseOrder(owner: Owner, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Purchase order not found");
  const r = await PurchaseOrder.findOneAndUpdate({ _id: id, owner, status: { $in: ["draft", "ordered"] }, receivedValuePaise: 0 }, { status: "cancelled" }, { new: true });
  if (!r) throw conflict("Only a purchase order with nothing received can be cancelled", "CANNOT_CANCEL");
  return r;
}

/** Average daily demand over the last `days`, reorder point and suggested quantity per product. Suggestions only; nothing is bought automatically. */
export async function reorderSuggestions(owner: Owner, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const [items, demand, open, suppliers] = await Promise.all([
    InventoryItem.find({ owner, archived: false }),
    StockMovement.aggregate([{ $match: { owner, createdAt: { $gte: since }, type: { $in: ["sale", "sale_reversal", "return_restock"] } } }, { $group: { _id: "$item", net: { $sum: "$delta" } } }]),
    PurchaseOrder.aggregate([{ $match: { owner, status: { $in: ["ordered", "partially_received"] } } }, { $unwind: "$lines" }, { $group: { _id: "$lines.item", incoming: { $sum: { $subtract: ["$lines.orderedQty", { $add: ["$lines.acceptedQty", "$lines.rejectedQty"] }] } } } }]),
    Supplier.find({ owner, archived: false }),
  ]);
  const dem = new Map(demand.map((d: any) => [String(d._id), Math.max(0, -d.net) / days]));
  const inc = new Map(open.map((d: any) => [String(d._id), d.incoming as number]));
  const lead = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.leadTimeDays ?? 5]));
  const out = [];
  for (const it of items) {
    const avg = dem.get(String(it._id)) ?? 0;
    if (avg === 0 && !(it.reorderLevel > 0)) continue;
    const leadTime = (it.supplier ? lead.get(it.supplier.toLowerCase()) : undefined) ?? 5;
    const s = suggestReorder({ available: it.quantity - (it.reserved ?? 0), incoming: inc.get(String(it._id)) ?? 0, avgDailyDemand: avg, leadTimeDays: leadTime, safetyStock: it.reorderLevel ?? 0 });
    if (s.needed) out.push({ itemId: String(it._id), sku: it.sku, name: it.name, supplier: it.supplier ?? "", available: it.quantity - (it.reserved ?? 0), incoming: inc.get(String(it._id)) ?? 0, avgDailyDemand: Math.round(avg * 100) / 100, leadTimeDays: leadTime, safetyStock: it.reorderLevel ?? 0, reorderPoint: s.reorderPoint, suggestedQty: s.suggestedQty, unitCostPaise: it.costPaise });
  }
  return out.sort((a, b) => a.available - b.available);
}
