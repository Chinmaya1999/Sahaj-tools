import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { daysUntil, itemInputSchema, movementSchema, rupeesToPaise, toCsv, type ItemInput } from "@ek/shared";
import { requireAuth } from "../lib/auth.js";
import { badRequest, conflict, notFound, parse, upgradeRequired, wrap } from "../lib/http.js";
import { escapeRegex } from "../lib/security.js";
import { InventoryItem, StockMovement } from "../models/index.js";
import { getAccess } from "../services/access.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const oid = (id: string) => { if (!Types.ObjectId.isValid(id)) throw notFound("Item not found"); return new Types.ObjectId(id); };
const itemView = (i: any) => ({ id: String(i._id), name: i.name, sku: i.sku, barcode: i.barcode, category: i.category, supplier: i.supplier, pricePaise: i.pricePaise, costPaise: i.costPaise, quantity: i.quantity, reserved: i.reserved ?? 0, available: i.quantity - (i.reserved ?? 0), taxPercent: i.taxPercent ?? 0, attributes: i.attributes, reorderLevel: i.reorderLevel, expiryDate: i.expiryDate, size: i.size, colour: i.colour, variant: i.variant, archived: i.archived, valuePaise: i.quantity * i.costPaise });

export async function assertCapacity(owner: Types.ObjectId, adding: number) {
  const access = await getAccess(owner, "inventory");
  const max = access.limits.maxItems;
  if (max === null) return;
  const count = await InventoryItem.countDocuments({ owner, archived: false });
  if (count + adding > Number(max)) throw upgradeRequired(`Your plan allows ${max} products (you have ${count}). Upgrade to add more.`, "inventory");
}

/**
 * Every quantity change goes through here so history is never lost.
 * Decrements are guarded by a conditional update ({quantity >= n}) which is atomic in MongoDB,
 * so concurrent requests can never drive stock negative or lose an update.
 * Stock-in recalculates the weighted-average cost in the same atomic update.
 */
export async function applyMovement(owner: Types.ObjectId, itemId: Types.ObjectId, type: string, qty: number, opts: { unitCostPaise?: number; note?: string; direction?: "increase" | "decrease" } = {}) {
  const sign = type === "stock_in" || type === "return" || type === "opening" ? 1 : type === "adjustment" ? (opts.direction === "increase" ? 1 : opts.direction === "decrease" ? -1 : 0) : -1;
  if (sign === 0) throw badRequest("Choose whether the adjustment increases or decreases stock");
  const delta = sign * qty;
  let updated;
  if (delta < 0) {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner, $expr: { $gte: [{ $subtract: ["$quantity", { $ifNull: ["$reserved", 0] }] }, qty] } }, { $inc: { quantity: delta } }, { new: true });
    if (!updated) {
      const exists = await InventoryItem.exists({ _id: itemId, owner });
      if (!exists) throw notFound("Item not found");
      throw conflict("Not enough stock for this change", "insufficient_stock");
    }
  } else if ((type === "stock_in" || type === "opening") && opts.unitCostPaise !== undefined) {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner }, [
      { $set: {
        costPaise: { $round: [{ $divide: [{ $add: [{ $multiply: ["$quantity", "$costPaise"] }, qty * opts.unitCostPaise] }, { $add: ["$quantity", qty] }] }, 0] },
        quantity: { $add: ["$quantity", qty] },
      } },
    ], { new: true, updatePipeline: true });
  } else {
    updated = await InventoryItem.findOneAndUpdate({ _id: itemId, owner }, { $inc: { quantity: delta } }, { new: true });
  }
  if (!updated) throw notFound("Item not found");
  const mv = await StockMovement.create({ owner, item: itemId, type: type as "sale", delta, qtyAfter: updated.quantity, unitCostPaise: opts.unitCostPaise, note: opts.note });
  return { item: updated, movement: mv };
}

/* ----- items ----- */
inventoryRouter.get("/items", wrap(async (req, res) => {
  const q = parse(z.object({ q: z.string().max(80).optional(), archived: z.enum(["true", "false"]).default("false"), filter: z.enum(["all", "low", "expiring", "expired"]).default("all") }), req.query);
  const f: any = { owner: req.user!._id, archived: q.archived === "true" };
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), "i"); f.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { category: rx }]; }
  let items = (await InventoryItem.find(f).sort({ name: 1 }).limit(5000)).map(itemView);
  const now = new Date();
  if (q.filter === "low") items = items.filter((i) => i.quantity <= i.reorderLevel);
  if (q.filter === "expiring") items = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate, now) >= 0 && daysUntil(i.expiryDate, now) <= 30);
  if (q.filter === "expired") items = items.filter((i) => i.expiryDate && daysUntil(i.expiryDate, now) < 0);
  res.json({ items });
}));

async function createItem(owner: Types.ObjectId, input: ItemInput) {
  const { openingQty, ...rest } = input;
  const item = await InventoryItem.create({ ...rest, sku: rest.sku, owner, quantity: 0, expiryDate: rest.expiryDate ?? undefined });
  if (openingQty > 0) await applyMovement(owner, item._id, "opening", openingQty, { unitCostPaise: input.costPaise, note: "Opening stock" });
  return (await InventoryItem.findById(item._id))!;
}

inventoryRouter.post("/items", wrap(async (req, res) => {
  const input = parse(itemInputSchema, req.body);
  await assertCapacity(req.user!._id, 1);
  try { res.status(201).json({ item: itemView(await createItem(req.user!._id, input)) }); }
  catch (e: any) { if (e?.code === 11000) throw conflict(`SKU "${input.sku}" already exists`, "duplicate_sku"); throw e; }
}));

inventoryRouter.put("/items/:id", wrap(async (req, res) => {
  const input = parse(itemInputSchema.omit({ openingQty: true }), req.body);
  try {
    const it = await InventoryItem.findOneAndUpdate({ _id: oid(String(req.params.id)), owner: req.user!._id }, { ...input, expiryDate: input.expiryDate ?? null }, { new: true });
    if (!it) throw notFound("Item not found");
    res.json({ item: itemView(it) });
  } catch (e: any) { if (e?.code === 11000) throw conflict(`SKU "${input.sku}" already exists`, "duplicate_sku"); throw e; }
}));

inventoryRouter.post("/items/:id/archive", wrap(async (req, res) => {
  const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
  if (!archived) await assertCapacity(req.user!._id, 1);
  const it = await InventoryItem.findOneAndUpdate({ _id: oid(String(req.params.id)), owner: req.user!._id }, { archived }, { new: true });
  if (!it) throw notFound("Item not found");
  res.json({ item: itemView(it) });
}));

inventoryRouter.post("/items/:id/movements", wrap(async (req, res) => {
  const m = parse(movementSchema, req.body);
  const r = await applyMovement(req.user!._id, oid(String(req.params.id)), m.type, m.quantity, { unitCostPaise: m.unitCostPaise, note: m.note, direction: m.direction });
  res.status(201).json({ item: itemView(r.item), movement: { id: r.movement.id, type: r.movement.type, delta: r.movement.delta, qtyAfter: r.movement.qtyAfter } });
}));

inventoryRouter.get("/movements", wrap(async (req, res) => {
  const q = parse(z.object({ item: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
  const f: any = { owner: req.user!._id };
  if (q.item) f.item = oid(q.item);
  const rows = await StockMovement.find(f).sort({ createdAt: -1 }).limit(q.limit).populate("item", "name sku");
  res.json({ movements: rows.map((m: any) => ({ id: m.id, type: m.type, delta: m.delta, qtyAfter: m.qtyAfter, note: m.note, unitCostPaise: m.unitCostPaise, at: m.createdAt, item: m.item ? { id: String(m.item._id), name: m.item.name, sku: m.item.sku } : null })) });
}));

/* ----- dashboard ----- */
inventoryRouter.get("/dashboard", wrap(async (req, res) => {
  const owner = req.user!._id;
  const items = (await InventoryItem.find({ owner, archived: false })).map(itemView);
  const now = new Date();
  const low = items.filter((i) => i.quantity <= i.reorderLevel && i.reorderLevel > 0);
  const expiring = items.filter((i) => i.expiryDate && i.quantity > 0 && daysUntil(i.expiryDate, now) >= 0 && daysUntil(i.expiryDate, now) <= 30).sort((a, b) => +new Date(a.expiryDate) - +new Date(b.expiryDate));
  const expired = items.filter((i) => i.expiryDate && i.quantity > 0 && daysUntil(i.expiryDate, now) < 0);
  const recent = await StockMovement.find({ owner }).sort({ createdAt: -1 }).limit(8).populate("item", "name sku");
  const access = await getAccess(owner, "inventory");
  res.json({
    totals: { skus: items.length, units: items.reduce((a, i) => a + i.quantity, 0), valuePaise: items.reduce((a, i) => a + i.valuePaise, 0), lowStock: low.length, expiringSoon: expiring.length, expired: expired.length },
    valuationMethod: "Weighted-average cost: stock-ins re-average the unit cost; sales, returns and damage use the current average. Value = quantity × average cost.",
    // reorder suggestion: bring stock back to twice the reorder level
    reorder: low.map((i) => ({ ...i, suggestedQty: Math.max(i.reorderLevel * 2 - i.quantity, 1) })),
    expiring, expired,
    recent: recent.map((m: any) => ({ id: m.id, type: m.type, delta: m.delta, qtyAfter: m.qtyAfter, at: m.createdAt, item: m.item ? { name: m.item.name, sku: m.item.sku } : null })),
    limit: access.limits.maxItems,
  });
}));

/** Paid feature: what sold, what it earned, what is not moving. Revenue/profit use CURRENT prices (documented in the response). */
inventoryRouter.get("/reports", wrap(async (req, res) => {
  const owner = req.user!._id;
  const access = await getAccess(owner, "inventory");
  if (!access.limits.reports) throw upgradeRequired("Sales and profit reports come with Inventory Pro or Business.", "inventory");
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
  const since = new Date(Date.now() - days * 86400_000);
  const [sold, items] = await Promise.all([
    StockMovement.aggregate([{ $match: { owner, type: "sale", createdAt: { $gte: since } } }, { $group: { _id: "$item", units: { $sum: { $abs: "$delta" } } } }]),
    InventoryItem.find({ owner, archived: false }),
  ]);
  const unitsBy = new Map(sold.map((x: any) => [String(x._id), x.units as number]));
  const rows = items.map((i) => { const u = unitsBy.get(String(i._id)) ?? 0; return { id: String(i._id), name: i.name, sku: i.sku, category: i.category || "Uncategorised", units: u, revenuePaise: u * i.pricePaise, profitPaise: u * (i.pricePaise - i.costPaise), quantity: i.quantity, valuePaise: i.quantity * i.costPaise }; });
  const top = rows.filter((r) => r.units > 0).sort((a, b) => b.profitPaise - a.profitPaise).slice(0, 5);
  const dead = rows.filter((r) => r.units === 0 && r.quantity > 0).sort((a, b) => b.valuePaise - a.valuePaise).slice(0, 8);
  const byCat = new Map<string, number>(); rows.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.valuePaise));
  res.json({
    days, note: "Revenue and profit are estimated from units sold × your current selling and cost prices.",
    totals: { units: rows.reduce((a, r) => a + r.units, 0), revenuePaise: rows.reduce((a, r) => a + r.revenuePaise, 0), profitPaise: rows.reduce((a, r) => a + r.profitPaise, 0) },
    top, dead, categories: [...byCat.entries()].map(([name, valuePaise]) => ({ name, valuePaise })).sort((a, b) => b.valuePaise - a.valuePaise),
  });
}));

/* ----- CSV import / export ----- */
const importRow = z.object({
  name: z.string(), sku: z.string(), barcode: z.string().optional(), category: z.string().optional(), supplier: z.string().optional(),
  price: z.string().optional(), cost: z.string().optional(), quantity: z.string().optional(), reorder_level: z.string().optional(),
  expiry_date: z.string().optional(), size: z.string().optional(), colour: z.string().optional(), variant: z.string().optional(),
});
function rowToItem(r: z.infer<typeof importRow>): { ok: true; item: ItemInput } | { ok: false; error: string } {
  const money = (v?: string) => { const s = (v ?? "").trim().replace(/^₹/, "").replace(/,/g, ""); if (s === "") return 0; if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`"${v}" is not a valid amount`); return rupeesToPaise(s); };
  const int = (v: string | undefined, label: string) => { const s = (v ?? "").trim(); if (s === "") return 0; if (!/^\d+$/.test(s)) throw new Error(`${label} must be a whole number ≥ 0`); return Number(s); };
  try {
    const exp = (r.expiry_date ?? "").trim();
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw new Error("expiry_date must be YYYY-MM-DD");
    if (exp && Number.isNaN(Date.parse(exp))) throw new Error("expiry_date is not a real date");
    const parsed = itemInputSchema.safeParse({
      name: r.name, sku: r.sku, barcode: r.barcode ?? "", category: r.category ?? "", supplier: r.supplier ?? "",
      pricePaise: money(r.price), costPaise: money(r.cost), reorderLevel: int(r.reorder_level, "reorder_level"), openingQty: int(r.quantity, "quantity"),
      expiryDate: exp ? new Date(exp) : null, size: r.size ?? "", colour: r.colour ?? "", variant: r.variant ?? "",
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0].path.join(".") + ": " + parsed.error.issues[0].message);
    return { ok: true, item: parsed.data };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

inventoryRouter.post("/import", wrap(async (req, res) => {
  const { rows, commit } = parse(z.object({ rows: z.array(importRow).min(1, "The file has no data rows").max(2000, "Import up to 2000 rows at a time"), commit: z.boolean().default(false) }), req.body);
  const owner = req.user!._id;
  const existing = new Set((await InventoryItem.find({ owner }, "sku")).map((i) => i.sku.toLowerCase()));
  const seen = new Set<string>();
  const report = rows.map((r, idx) => {
    const base = { row: idx + 2, sku: r.sku, name: r.name };
    const p = rowToItem(r);
    if (!p.ok) return { ...base, status: "error" as const, message: p.error };
    const key = p.item.sku.toLowerCase();
    if (existing.has(key)) return { ...base, status: "skipped" as const, message: "SKU already exists – skipped" };
    if (seen.has(key)) return { ...base, status: "error" as const, message: "Duplicate SKU inside this file" };
    seen.add(key);
    return { ...base, status: "ok" as const, message: "", item: p.item };
  });
  const valid = report.filter((r) => r.status === "ok");
  let created = 0;
  if (commit && valid.length) {
    await assertCapacity(owner, valid.length);
    for (const r of valid) {
      try { await createItem(owner, (r as any).item); created++; }
      catch (e: any) { if (e?.code === 11000) { (r as any).status = "skipped"; (r as any).message = "SKU already exists – skipped"; } else throw e; }
    }
  }
  res.json({ committed: commit, created, summary: { ok: valid.length, errors: report.filter((r) => r.status === "error").length, skipped: report.filter((r) => r.status === "skipped").length }, report: report.map(({ ...r }) => { delete (r as any).item; return r; }) });
}));

inventoryRouter.get("/export.csv", wrap(async (req, res) => {
  const items = await InventoryItem.find({ owner: req.user!._id, archived: false }).sort({ name: 1 });
  const rows: (string | number)[][] = [["name", "sku", "barcode", "category", "supplier", "price", "cost", "quantity", "reorder_level", "expiry_date", "size", "colour", "variant"]];
  for (const i of items) rows.push([i.name, i.sku, i.barcode ?? "", i.category ?? "", i.supplier ?? "", (i.pricePaise / 100).toFixed(2), (i.costPaise / 100).toFixed(2), i.quantity, i.reorderLevel ?? 0, i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : "", i.size ?? "", i.colour ?? "", i.variant ?? ""]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory.csv"');
  res.send("﻿" + toCsv(rows));
}));
inventoryRouter.get("/movements.csv", wrap(async (req, res) => {
  const mv = await StockMovement.find({ owner: req.user!._id }).sort({ createdAt: -1 }).limit(10000).populate("item", "name sku");
  const rows: (string | number)[][] = [["date", "sku", "name", "type", "change", "quantity_after", "note"]];
  for (const m of mv as any[]) rows.push([m.createdAt.toISOString(), m.item?.sku ?? "", m.item?.name ?? "", m.type, m.delta, m.qtyAfter, m.note ?? ""]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="stock-movements.csv"');
  res.send("﻿" + toCsv(rows));
}));
