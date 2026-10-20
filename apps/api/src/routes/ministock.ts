import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import {
  EXPENSE_CATEGORIES, adjustSchema, businessDay, cashCloseSchema, customerSchema, dayRange, expenseSchema, orderInputSchema, paymentInSchema, productFormSchema,
  purchaseOrderSchema, receiveSchema, returnInputSchema, stockCountSchema, supplierSchema, suggestSku, toCsv,
} from "@ek/shared";
import { requireAuth } from "../lib/auth.js";
import { badRequest, conflict, notFound, parse, wrap } from "../lib/http.js";
import { escapeRegex } from "../lib/security.js";
import { CashClose, Customer, Expense, InventoryItem, PurchaseOrder, SaleOrder, SalePayment, SaleReturn, StockCount, StockMovement, Supplier } from "../models/index.js";
import { audit } from "../services/audit.js";
import { DEFINITIONS, buildReport, cashPreview, closeCash, customerLedger, dashboard, periodSummary } from "../services/finance.js";
import { cancelPurchaseOrder, createPurchaseOrder, paySupplier, poView, receiveGoods, reorderSuggestions } from "../services/purchasing.js";
import { cancelOrder, confirmPayment, createOrder, createReturn, failPayment, inspectReturn, moveOrder, nextNumber, orderView, paymentView, recordPayment, returnView } from "../services/sales.js";
import { availableOf, moveStock } from "../services/stock.js";
import { assertCapacity } from "./inventory.js";

export const ministockRouter = Router();
ministockRouter.use(requireAuth);

const oid = (id: string, what = "Record") => { if (!Types.ObjectId.isValid(id)) throw notFound(`${what} not found`); return new Types.ObjectId(id); };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const range = (q: any) => {
  const p = parse(z.object({ from: day.optional(), to: day.optional() }), q);
  const to = p.to ?? businessDay(new Date()); const from = p.from ?? businessDay(new Date(Date.now() - 29 * 86400_000));
  if (from > to) throw badRequest("The start date is after the end date");
  return { from: dayRange(from).start, to: dayRange(to).end, fromDay: from, toDay: to };
};
const page = (q: any, max = 100) => parse(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(max).default(25) }), q);
const keyOf = (req: any, bodyKey?: string) => (req.get("idempotency-key") || bodyKey || undefined) as string | undefined;

/* ---------------- dashboard & finance ---------------- */
ministockRouter.get("/dashboard", wrap(async (req, res) => { res.json(await dashboard(req.user!._id)); }));
ministockRouter.get("/finance/summary", wrap(async (req, res) => {
  const r = range(req.query); const owner = req.user!._id;
  const [summary, items, recv, pay] = await Promise.all([
    periodSummary(owner, r.from, r.to), InventoryItem.find({ owner, archived: false }),
    buildReport(owner, "receivables", r.from, r.to), buildReport(owner, "payables", r.from, r.to),
  ]);
  res.json({ from: r.fromDay, to: r.toDay, ...summary, receivablesPaise: recv.totals?.owing ?? 0, payablesPaise: pay.totals?.owing ?? 0, inventoryValuePaise: items.reduce((a, i) => a + i.quantity * i.costPaise, 0), definitions: DEFINITIONS });
}));
ministockRouter.get("/finance/cash-close/preview", wrap(async (req, res) => { res.json(await cashPreview(req.user!._id, parse(z.object({ date: day }), req.query).date)); }));
ministockRouter.get("/finance/cash-closes", wrap(async (req, res) => { res.json({ closes: await CashClose.find({ owner: req.user!._id }).sort({ date: -1 }).limit(60) }); }));
ministockRouter.post("/finance/cash-close", wrap(async (req, res) => {
  const b = parse(cashCloseSchema, req.body);
  const c = await closeCash(req.user!._id, req.user!._id, b);
  await audit(req, "cash.close", String(c._id), { date: b.date, differencePaise: c.differencePaise });
  res.status(201).json({ close: c });
}));

/* ---------------- reports (JSON or CSV) ---------------- */
ministockRouter.get("/reports/:kind", wrap(async (req, res) => {
  const r = range(req.query); const fmt = parse(z.object({ format: z.enum(["json", "csv"]).default("json") }), req.query).format;
  const rep = await buildReport(req.user!._id, String(req.params.kind), r.from, r.to);
  if (fmt === "csv") {
    const money = new Set(rep.columns.filter((c) => c.money).map((c) => c.key));
    const rows: (string | number)[][] = [rep.columns.map((c) => c.label), ...rep.rows.map((row) => rep.columns.map((c) => (money.has(c.key) ? ((row[c.key] as number) / 100).toFixed(2) : row[c.key])))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${String(req.params.kind)}-${r.fromDay}-to-${r.toDay}.csv"`);
    return res.send("﻿" + toCsv(rows));
  }
  res.json({ ...rep, from: r.fromDay, to: r.toDay });
}));

/* ---------------- products & stock ---------------- */
const productView = (i: any) => ({ id: String(i._id), name: i.name, sku: i.sku, barcode: i.barcode, category: i.category, supplier: i.supplier, size: i.size, colour: i.colour, variant: i.variant, attributes: i.attributes, pricePaise: i.pricePaise, costPaise: i.costPaise, taxPercent: i.taxPercent ?? 0, onHand: i.quantity, reserved: i.reserved ?? 0, available: availableOf(i), reorderLevel: i.reorderLevel, archived: i.archived });

ministockRouter.get("/products", wrap(async (req, res) => {
  const q = parse(z.object({ q: z.string().max(80).optional(), archived: z.enum(["true", "false"]).default("false"), low: z.enum(["true", "false"]).default("false") }), req.query);
  const p = page(req.query, 200);
  const f: any = { owner: req.user!._id, archived: q.archived === "true" };
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), "i"); f.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { category: rx }, { colour: rx }, { size: rx }]; }
  if (q.low === "true") { f.reorderLevel = { $gt: 0 }; f.$expr = { $lte: [{ $subtract: ["$quantity", { $ifNull: ["$reserved", 0] }] }, "$reorderLevel"] }; }
  const [rows, total] = await Promise.all([InventoryItem.find(f).sort({ name: 1, sku: 1 }).skip((p.page - 1) * p.limit).limit(p.limit), InventoryItem.countDocuments(f)]);
  res.json({ products: rows.map(productView), total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
}));

ministockRouter.get("/products/suggest-sku", wrap(async (req, res) => {
  const f = parse(productFormSchema.pick({ name: true, ageGroup: true, size: true, colour: true, productType: true, variant: true }).partial({ ageGroup: true, size: true, colour: true, productType: true, variant: true }), { ...req.query });
  res.json({ sku: suggestSku({ name: f.name, ageGroup: f.ageGroup ?? "", size: f.size ?? "", colour: f.colour ?? "", productType: f.productType ?? "", variant: f.variant ?? "" }) });
}));

/** Scan a barcode / QR / SKU. Unknown codes never create anything: the app is told to retry or use Add Product. */
ministockRouter.get("/products/barcode/:code", wrap(async (req, res) => {
  const owner = req.user!._id; const code = String(req.params.code).trim();
  const it = await InventoryItem.findOne({ owner, $or: [{ barcode: code }, { sku: new RegExp(`^${escapeRegex(code)}$`, "i") }] });
  if (!it) return res.status(404).json({ error: "Product not found", code: "PRODUCT_NOT_FOUND", hint: "Retry the scan, or add it with Add Product. Nothing was created." });
  const [movements, sales] = await Promise.all([
    StockMovement.find({ owner, item: it._id }).sort({ createdAt: -1 }).limit(8),
    SaleOrder.find({ owner, "lines.item": it._id, status: { $ne: "cancelled" } }).sort({ createdAt: -1 }).limit(5).select("number createdAt totalPaise lines"),
  ]);
  res.json({ product: productView(it), movements: movements.map((m: any) => ({ type: m.type, delta: m.delta, qtyAfter: m.qtyAfter, reason: m.reason ?? m.note, at: m.createdAt })), recentSales: sales.map((s: any) => ({ number: s.number, at: s.createdAt, quantity: s.lines.find((l: any) => String(l.item) === String(it._id))?.quantity })) });
}));

/** Workflow A: create a NEW product/variant. Never silently merges with an existing one. */
ministockRouter.post("/products", wrap(async (req, res) => {
  const owner = req.user!._id; const f = parse(productFormSchema, req.body);
  await assertCapacity(owner, 1);
  const sku = (f.sku || suggestSku(f)).trim();
  if (!sku) throw badRequest("Enter a SKU, or fill in the name, age/size, colour and type so one can be suggested");
  const same = { owner, archived: false, name: new RegExp(`^${escapeRegex(f.name)}$`, "i"), size: f.size || f.ageGroup || "", colour: new RegExp(`^${escapeRegex(f.colour)}$`, "i"), "attributes.productType": f.productType || "", "attributes.ageGroup": f.ageGroup || "" };
  if (await InventoryItem.exists(same as any)) throw conflict("A product with the same design, age/size, colour and type already exists. Update its stock instead.", "DUPLICATE_VARIANT");
  let item;
  try {
    item = await InventoryItem.create({ owner, name: f.name, sku, barcode: f.barcode || undefined, category: f.category, supplier: f.supplier, pricePaise: f.pricePaise, costPaise: f.costPaise, reorderLevel: f.reorderLevel, size: f.size || f.ageGroup, colour: f.colour, variant: f.variant || f.productType, taxPercent: f.taxPercent, attributes: { productType: f.productType, ageGroup: f.ageGroup, design: f.design || f.name }, quantity: 0, reserved: 0 });
  } catch (e: any) { if (e?.code === 11000) throw conflict(`SKU "${sku}" already exists in your business`, "duplicate_sku"); throw e; }
  if (f.openingQty > 0) await moveStock(owner, item._id, f.openingQty, { type: "stock_in", unitCostPaise: f.costPaise, reason: "Opening stock", actor: owner, refType: "product", refId: item._id });
  await audit(req, "product.create", String(item._id), { sku });
  res.status(201).json({ product: productView((await InventoryItem.findById(item._id))!) });
}));

/** A price change updates the product only. Existing orders keep the price they were sold at. */
ministockRouter.patch("/products/:id", wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), pricePaise: z.number().int().min(0).max(100_000_000_00).optional(), costPaise: z.number().int().min(0).max(100_000_000_00).optional(), reorderLevel: z.number().int().min(0).max(1_000_000).optional(), barcode: z.string().trim().max(40).optional(), taxPercent: z.number().min(0).max(100).optional(), archived: z.boolean().optional() }), req.body);
  const it = await InventoryItem.findOneAndUpdate({ _id: oid(String(req.params.id), "Product"), owner: req.user!._id }, b, { new: true });
  if (!it) throw notFound("Product not found");
  await audit(req, "product.update", String(it._id), b);
  res.json({ product: productView(it) });
}));

/** Workflow B: change stock of an EXISTING product. A reason is mandatory; stock is never overwritten without a movement record. */
ministockRouter.post("/stock/adjust", wrap(async (req, res) => {
  const owner = req.user!._id; const b = parse(adjustSchema, req.body);
  const id = oid(b.itemId, "Product"); const it = await InventoryItem.findOne({ _id: id, owner });
  if (!it) throw notFound("Product not found. Use Add Product to create it.");
  let delta = b.mode === "add" ? b.quantity : b.mode === "remove" ? -b.quantity : b.quantity - it.quantity;
  if (delta === 0) throw badRequest("The counted quantity is the same as the recorded quantity");
  const loss = b.reason === "damage" || b.reason === "loss" || b.reason === "expired";
  if (delta > 0 && loss) throw badRequest("Damage, loss and expiry can only reduce stock");
  const r = await moveStock(owner, id, delta, { type: loss ? "damage" : "adjustment", reason: b.reason, note: b.note || undefined, actor: owner, refType: "adjustment" });
  await audit(req, "stock.adjust", String(id), { mode: b.mode, delta, reason: b.reason, before: r.item.quantity - delta, after: r.item.quantity });
  res.status(201).json({ product: productView(r.item), movement: { delta, qtyAfter: r.item.quantity, before: r.item.quantity - delta, reason: b.reason } });
}));

/* ---------------- customers ---------------- */
ministockRouter.get("/customers", wrap(async (req, res) => {
  const owner = req.user!._id; const q = parse(z.object({ q: z.string().max(80).optional() }), req.query);
  const f: any = { owner, archived: false }; if (q.q) { const rx = new RegExp(escapeRegex(q.q), "i"); f.$or = [{ name: rx }, { phone: rx }]; }
  const cs = await Customer.find(f).sort({ name: 1 }).limit(500);
  const dues = await SaleOrder.aggregate([{ $match: { owner, status: { $nin: ["cancelled", "draft"] }, customer: { $in: cs.map((c) => c._id) } } }, { $group: { _id: "$customer", owing: { $sum: { $max: [0, { $subtract: [{ $subtract: ["$totalPaise", "$returnedValuePaise"] }, { $subtract: ["$paidPaise", "$refundedPaise"] }] }] } }, purchases: { $sum: "$totalPaise" }, orders: { $sum: 1 } } }]);
  const by = new Map(dues.map((d: any) => [String(d._id), d]));
  res.json({ customers: cs.map((c: any) => ({ id: String(c._id), name: c.name, phone: c.phone, address: c.address, notes: c.notes, remindersConsent: c.remindersConsent, paymentTermsDays: c.paymentTermsDays, outstandingPaise: by.get(String(c._id))?.owing ?? 0, purchasesPaise: by.get(String(c._id))?.purchases ?? 0, orders: by.get(String(c._id))?.orders ?? 0 })) });
}));
ministockRouter.post("/customers", wrap(async (req, res) => { const c = await Customer.create({ ...parse(customerSchema, req.body), owner: req.user!._id }); await audit(req, "customer.create", String(c._id)); res.status(201).json({ customer: c }); }));
ministockRouter.patch("/customers/:id", wrap(async (req, res) => {
  const c = await Customer.findOneAndUpdate({ _id: oid(String(req.params.id), "Customer"), owner: req.user!._id }, { ...parse(customerSchema.partial().extend({ archived: z.boolean().optional() }), req.body) }, { new: true });
  if (!c) throw notFound("Customer not found"); res.json({ customer: c });
}));
ministockRouter.get("/customers/:id/ledger", wrap(async (req, res) => {
  const l = await customerLedger(req.user!._id, String(oid(String(req.params.id), "Customer")));
  if (!l) throw notFound("Customer not found");
  res.json({ customer: l.customer, totals: l.totals, orders: l.orders.map(orderView), payments: l.payments.map(paymentView) });
}));

/* ---------------- suppliers & purchasing ---------------- */
ministockRouter.get("/suppliers", wrap(async (req, res) => {
  const owner = req.user!._id; const ss = await Supplier.find({ owner, archived: false }).sort({ name: 1 });
  const bal = await PurchaseOrder.aggregate([{ $match: { owner, status: { $ne: "cancelled" } } }, { $group: { _id: "$supplier", owing: { $sum: { $subtract: ["$receivedValuePaise", "$paidPaise"] } }, orders: { $sum: 1 } } }]);
  const by = new Map(bal.map((b: any) => [String(b._id), b]));
  res.json({ suppliers: ss.map((s: any) => ({ id: String(s._id), name: s.name, businessName: s.businessName, phone: s.phone, email: s.email, address: s.address, taxId: s.taxId, paymentTermsDays: s.paymentTermsDays, leadTimeDays: s.leadTimeDays, notes: s.notes, balancePaise: by.get(String(s._id))?.owing ?? 0, orders: by.get(String(s._id))?.orders ?? 0 })) });
}));
ministockRouter.post("/suppliers", wrap(async (req, res) => { const s = await Supplier.create({ ...parse(supplierSchema, req.body), owner: req.user!._id }); await audit(req, "supplier.create", String(s._id)); res.status(201).json({ supplier: s }); }));
ministockRouter.patch("/suppliers/:id", wrap(async (req, res) => {
  const s = await Supplier.findOneAndUpdate({ _id: oid(String(req.params.id), "Supplier"), owner: req.user!._id }, parse(supplierSchema.partial().extend({ archived: z.boolean().optional() }), req.body), { new: true });
  if (!s) throw notFound("Supplier not found"); res.json({ supplier: s });
}));
ministockRouter.get("/reorder", wrap(async (req, res) => { res.json({ suggestions: await reorderSuggestions(req.user!._id), note: "Reorder point = average daily demand × supplier lead time + safety stock (your low-stock level). These are suggestions only; nothing is ordered automatically." }); }));
ministockRouter.get("/purchase-orders", wrap(async (req, res) => {
  const q = parse(z.object({ status: z.enum(["draft", "ordered", "partially_received", "received", "cancelled"]).optional() }), req.query); const p = page(req.query);
  const f: any = { owner: req.user!._id }; if (q.status) f.status = q.status;
  const [rows, total] = await Promise.all([PurchaseOrder.find(f).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit), PurchaseOrder.countDocuments(f)]);
  res.json({ purchaseOrders: rows.map(poView), total });
}));
ministockRouter.get("/purchase-orders/:id", wrap(async (req, res) => { const po = await PurchaseOrder.findOne({ _id: oid(String(req.params.id), "Purchase order"), owner: req.user!._id }); if (!po) throw notFound("Purchase order not found"); res.json({ purchaseOrder: poView(po) }); }));
ministockRouter.post("/purchase-orders", wrap(async (req, res) => { const po = await createPurchaseOrder(req.user!._id, parse(purchaseOrderSchema, req.body)); await audit(req, "po.create", po.number ?? undefined); res.status(201).json({ purchaseOrder: poView(po) }); }));
ministockRouter.post("/purchase-orders/:id/receive", wrap(async (req, res) => {
  const r = await receiveGoods(req.user!._id, req.user!._id, String(req.params.id), parse(receiveSchema, req.body));
  if (!r.replayed) await audit(req, "po.receive", String(r.po._id));
  res.status(r.replayed ? 200 : 201).json({ purchaseOrder: poView(r.po), replayed: r.replayed });
}));
ministockRouter.post("/purchase-orders/:id/payments", wrap(async (req, res) => {
  const b = parse(z.object({ amountPaise: z.number().int().min(1), method: z.enum(["cash", "upi", "card", "bank"]), reference: z.string().trim().max(80).optional() }), req.body);
  const po = await paySupplier(req.user!._id, req.user!._id, String(req.params.id), b); await audit(req, "po.pay", String(po._id), { amountPaise: b.amountPaise });
  res.status(201).json({ purchaseOrder: poView(po) });
}));
ministockRouter.post("/purchase-orders/:id/cancel", wrap(async (req, res) => { const po = await cancelPurchaseOrder(req.user!._id, String(req.params.id)); await audit(req, "po.cancel", String(po._id)); res.json({ purchaseOrder: poView(po) }); }));

/* ---------------- sales orders ---------------- */
ministockRouter.get("/orders", wrap(async (req, res) => {
  const owner = req.user!._id;
  const q = parse(z.object({ status: z.string().optional(), q: z.string().max(60).optional(), customer: z.string().optional(), unpaid: z.enum(["true", "false"]).default("false") }), req.query);
  const p = page(req.query); const f: any = { owner };
  if (q.status) f.status = { $in: q.status.split(",") };
  if (q.customer) f.customer = oid(q.customer, "Customer");
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), "i"); f.$or = [{ number: rx }, { customerName: rx }]; }
  if (q.unpaid === "true") { f.status = { $nin: ["cancelled", "draft"] }; f.$expr = { $gt: [{ $subtract: [{ $subtract: ["$totalPaise", "$returnedValuePaise"] }, { $subtract: ["$paidPaise", "$refundedPaise"] }] }, 0] }; }
  const [rows, total] = await Promise.all([SaleOrder.find(f).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit), SaleOrder.countDocuments(f)]);
  res.json({ orders: rows.map(orderView), total, page: p.page, pages: Math.max(1, Math.ceil(total / p.limit)) });
}));
ministockRouter.get("/orders/:id", wrap(async (req, res) => {
  const owner = req.user!._id; const o = await SaleOrder.findOne({ _id: oid(String(req.params.id), "Order"), owner }); if (!o) throw notFound("Order not found");
  const [payments, returns] = await Promise.all([SalePayment.find({ owner, order: o._id }).sort({ createdAt: 1 }), SaleReturn.find({ owner, order: o._id }).sort({ createdAt: 1 })]);
  res.json({ order: orderView(o), payments: payments.map(paymentView), returns: returns.map(returnView) });
}));
/** Totals are always recalculated here. Send an Idempotency-Key header (or key) so a double tap or retry returns the same order. */
ministockRouter.post("/orders", wrap(async (req, res) => {
  const input = parse(orderInputSchema, req.body); input.key = keyOf(req, input.key);
  const r = await createOrder(req.user!._id, req.user!._id, input);
  if (!r.replayed) await audit(req, "order.create", String(r.order._id), { number: r.order.number, totalPaise: r.order.totalPaise });
  res.status(r.replayed ? 200 : 201).json({ order: orderView(r.order), replayed: r.replayed });
}));
for (const [path, to] of [["confirm", "confirmed"], ["pack", "packed"], ["ship", "shipped"], ["deliver", "delivered"]] as const) {
  ministockRouter.post(`/orders/:id/${path}`, wrap(async (req, res) => {
    const b = parse(z.object({ courier: z.string().trim().max(60).optional(), tracking: z.string().trim().max(80).optional(), scans: z.array(z.string().max(60)).max(500).optional() }), req.body ?? {});
    const o = await moveOrder(req.user!._id, req.user!._id, String(req.params.id), to, b);
    await audit(req, `order.${path}`, String(o._id)); res.json({ order: orderView(o) });
  }));
}
ministockRouter.post("/orders/:id/cancel", wrap(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(1, "Give a reason").max(200) }), req.body);
  const o = await cancelOrder(req.user!._id, req.user!._id, String(req.params.id), reason); await audit(req, "order.cancel", String(o._id), { reason }); res.json({ order: orderView(o) });
}));
ministockRouter.post("/orders/:id/payments", wrap(async (req, res) => {
  const p = await recordPayment(req.user!._id, req.user!._id, String(req.params.id), parse(paymentInSchema, req.body));
  const o = await SaleOrder.findById(p.order); await audit(req, "payment.record", String(p._id), { amountPaise: p.amountPaise, status: p.status });
  res.status(201).json({ payment: paymentView(p), order: orderView(o) });
}));
ministockRouter.get("/payments", wrap(async (req, res) => {
  const q = parse(z.object({ status: z.enum(["pending", "confirmed", "failed"]).optional(), kind: z.enum(["payment", "refund"]).optional() }), req.query); const p = page(req.query);
  const f: any = { owner: req.user!._id, ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) };
  const rows = await SalePayment.find(f).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit).populate("order", "number customerName");
  res.json({ payments: rows.map((x: any) => ({ ...paymentView(x), orderNumber: x.order?.number, customerName: x.order?.customerName })) });
}));
ministockRouter.post("/payments/:id/confirm", wrap(async (req, res) => { const p = await confirmPayment(req.user!._id, String(req.params.id)); await audit(req, "payment.confirm", String(p._id)); res.json({ payment: paymentView(p) }); }));
ministockRouter.post("/payments/:id/fail", wrap(async (req, res) => { const p = await failPayment(req.user!._id, String(req.params.id)); res.json({ payment: paymentView(p) }); }));

/* ---------------- returns ---------------- */
ministockRouter.get("/returns", wrap(async (req, res) => { const rs = await SaleReturn.find({ owner: req.user!._id }).sort({ createdAt: -1 }).limit(100); res.json({ returns: rs.map(returnView) }); }));
ministockRouter.post("/returns", wrap(async (req, res) => {
  const input = parse(returnInputSchema, req.body); input.key = keyOf(req, input.key);
  const r = await createReturn(req.user!._id, req.user!._id, input);
  if (!r.replayed) await audit(req, "return.create", String(r.ret._id), { valuePaise: r.ret.returnedValuePaise });
  res.status(r.replayed ? 200 : 201).json({ return: returnView(r.ret), replayed: r.replayed });
}));
ministockRouter.post("/returns/:id/inspect", wrap(async (req, res) => {
  const b = parse(z.object({ decisions: z.array(z.object({ index: z.number().int().min(0).max(200), condition: z.enum(["restockable", "damaged"]) })).min(1).max(100) }), req.body);
  const r = await inspectReturn(req.user!._id, req.user!._id, String(req.params.id), b.decisions); await audit(req, "return.inspect", String(r._id)); res.json({ return: returnView(r) });
}));

/* ---------------- expenses ---------------- */
const expView = (e: any) => ({ id: String(e._id), category: e.category, amountPaise: e.amountPaise, date: e.date, account: e.account, note: e.note });
ministockRouter.get("/expenses", wrap(async (req, res) => {
  const r = range(req.query); const rows = await Expense.find({ owner: req.user!._id, date: { $gte: r.from, $lt: r.to } }).sort({ date: -1 }).limit(1000);
  res.json({ expenses: rows.map(expView), totalPaise: rows.reduce((a, e) => a + e.amountPaise!, 0), categories: EXPENSE_CATEGORIES });
}));
ministockRouter.post("/expenses", wrap(async (req, res) => { const e = await Expense.create({ ...parse(expenseSchema, req.body), owner: req.user!._id, createdBy: req.user!._id }); await audit(req, "expense.create", String(e._id), { amountPaise: e.amountPaise }); res.status(201).json({ expense: expView(e) }); }));
ministockRouter.patch("/expenses/:id", wrap(async (req, res) => { const e = await Expense.findOneAndUpdate({ _id: oid(String(req.params.id), "Expense"), owner: req.user!._id }, parse(expenseSchema.partial(), req.body), { new: true }); if (!e) throw notFound("Expense not found"); await audit(req, "expense.update", String(e._id)); res.json({ expense: expView(e) }); }));
ministockRouter.delete("/expenses/:id", wrap(async (req, res) => { const e = await Expense.findOneAndDelete({ _id: oid(String(req.params.id), "Expense"), owner: req.user!._id }); if (!e) throw notFound("Expense not found"); await audit(req, "expense.delete", String(e._id), { amountPaise: e.amountPaise }); res.json({ ok: true }); }));

/* ---------------- stocktake ---------------- */
ministockRouter.get("/stock-counts", wrap(async (req, res) => { const cs = await StockCount.find({ owner: req.user!._id }).sort({ createdAt: -1 }).limit(50); res.json({ counts: cs }); }));
ministockRouter.post("/stock-counts", wrap(async (req, res) => {
  const owner = req.user!._id; const b = parse(stockCountSchema, req.body);
  const items = await InventoryItem.find({ owner, _id: { $in: b.lines.map((l) => oid(l.itemId, "Product")) } });
  const by = new Map(items.map((i) => [String(i._id), i]));
  const lines = b.lines.map((l) => { const it = by.get(l.itemId); if (!it) throw notFound("A counted product was not found"); return { item: it._id, sku: it.sku, name: it.name, systemQty: it.quantity, countedQty: l.counted, variance: l.counted - it.quantity }; });
  const c = await StockCount.create({ owner, number: await nextNumber(owner, "count", "SC"), status: "draft", note: b.note, lines, createdBy: owner });
  res.status(201).json({ count: c });
}));
/** Counts are never applied silently: the seller reviews the variances and confirms. Each variance becomes a recorded stocktake movement. */
ministockRouter.post("/stock-counts/:id/post", wrap(async (req, res) => {
  const owner = req.user!._id; parse(z.object({ confirm: z.literal(true, { message: "Confirm to post the count" }) }), req.body);
  const c = await StockCount.findOneAndUpdate({ _id: oid(String(req.params.id), "Stock count"), owner, status: "draft" }, { status: "posted", postedAt: new Date(), postedBy: owner });
  if (!c) throw conflict("This count was already posted or cancelled", "COUNT_NOT_OPEN");
  const failed: string[] = [];
  for (const l of c.lines) {
    if (!l.variance) continue;
    try { await moveStock(owner, l.item!, l.variance, { type: "stocktake", reason: `Stock count ${c.number}`, actor: owner, refType: "stock_count", refId: c._id }); }
    catch (e: any) { failed.push(`${l.sku}: ${e.message}`); }
  }
  await audit(req, "stockcount.post", String(c._id), { failed });
  res.json({ count: await StockCount.findById(c._id), failed });
}));
ministockRouter.post("/stock-counts/:id/cancel", wrap(async (req, res) => { const c = await StockCount.findOneAndUpdate({ _id: oid(String(req.params.id), "Stock count"), owner: req.user!._id, status: "draft" }, { status: "cancelled" }, { new: true }); if (!c) throw conflict("Only an open count can be cancelled", "COUNT_NOT_OPEN"); res.json({ count: c }); }));
