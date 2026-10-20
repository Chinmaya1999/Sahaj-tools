import { Router } from "express";
import { z } from "zod";
import { PLANS, PRODUCTS, planById } from "@ek/shared";
import mongoose, { Types } from "mongoose";
import { requireAdmin } from "../lib/auth.js";
import { badRequest, notFound, parse, wrap } from "../lib/http.js";
import { escapeRegex } from "../lib/security.js";
import * as M from "../models/index.js";
import { audit } from "../services/audit.js";
import { refundOrder } from "../services/billing.js";
import { effectiveCatalog } from "../services/catalog.js";
import { llmEnabled } from "../services/llm.js";
import { getProvider } from "../services/payments/index.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin); // enforced on the server for every admin endpoint
const startedAt = Date.now();
const errorCounter = { count: 0, last: null as null | { at: Date; message: string } };
export const recordError = (m: string) => { errorCounter.count++; errorCounter.last = { at: new Date(), message: m.slice(0, 200) }; };

adminRouter.get("/stats", wrap(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [users, paidOrders, orders30, revenue, payingUsers, openSupport, byPlan] = await Promise.all([
    M.User.countDocuments(), M.Order.countDocuments({ status: "paid" }), M.Order.countDocuments({ createdAt: { $gte: since } }),
    M.Order.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amountPaise" } } }]),
    M.Order.distinct("user", { status: "paid" }), M.SupportRequest.countDocuments({ status: { $ne: "resolved" } }),
    M.Order.aggregate([{ $match: { status: "paid" } }, { $group: { _id: "$itemId", n: { $sum: 1 }, revenue: { $sum: "$amountPaise" } } }, { $sort: { revenue: -1 } }]),
  ]);
  const refunded = await M.Order.aggregate([{ $match: { status: "refunded" } }, { $group: { _id: null, total: { $sum: "$amountPaise" } } }]);
  res.json({
    users, paidOrders, ordersLast30Days: orders30, revenuePaise: revenue[0]?.total ?? 0, refundedPaise: refunded[0]?.total ?? 0,
    conversionPercent: users ? Math.round((payingUsers.length / users) * 1000) / 10 : 0, openSupport, byPlan,
    note: "Conversion = users with at least one paid order ÷ all users.",
  });
}));

adminRouter.get("/health", wrap(async (_req, res) => {
  const ping = await mongoose.connection.db!.admin().ping().then(() => true).catch(() => false);
  res.json({ database: ping ? "ok" : "down", uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), paymentProvider: getProvider().name, aiEnabled: llmEnabled(), errorsSinceStart: errorCounter.count, lastError: errorCounter.last, node: process.version });
}));

adminRouter.get("/users", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").slice(0, 80);
  const f = q ? { $or: [{ email: new RegExp(escapeRegex(q), "i") }, { name: new RegExp(escapeRegex(q), "i") }] } : {};
  const users = await M.User.find(f, "email name role disabled createdAt lastLoginAt").sort({ createdAt: -1 }).limit(100);
  res.json({ users: users.map((u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, disabled: u.disabled, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })) });
}));

adminRouter.get("/users/:id", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("User not found");
  const u = await M.User.findById(String(req.params.id), "email name role disabled createdAt lastLoginAt");
  if (!u) throw notFound("User not found");
  const [orders, entitlements, invoices, items] = await Promise.all([
    M.Order.find({ user: u._id }).sort({ createdAt: -1 }).limit(20).lean(), M.Entitlement.find({ user: u._id }).sort({ createdAt: -1 }).lean(),
    M.Invoice.countDocuments({ owner: u._id }), M.InventoryItem.countDocuments({ owner: u._id }),
  ]);
  res.json({ user: u, orders, entitlements, usage: { invoices, inventoryItems: items } });
}));
const setDisabled = (disable: boolean) => wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("User not found");
  const u = await M.User.findById(String(req.params.id));
  if (!u) throw notFound("User not found");
  if (u.role === "admin") throw badRequest("Administrator accounts cannot be suspended here");
  u.disabled = disable; await u.save();
  if (disable) await M.Session.deleteMany({ user: u._id });
  await audit(req, disable ? "admin.user_disabled" : "admin.user_enabled", u.id);
  res.json({ ok: true, disabled: disable });
});
adminRouter.post("/users/:id/disable", setDisabled(true));
adminRouter.post("/users/:id/enable", setDisabled(false));

/** Everything the admin home screen needs in one call. */
adminRouter.get("/dashboard", wrap(async (_req, res) => {
  const day = 86400_000; const now = Date.now();
  const d30 = new Date(now - 30 * day), d60 = new Date(now - 60 * day), d7 = new Date(now - 7 * day), hourAgo = new Date(now - 3600_000);
  const sum = (from: Date, to: Date) => M.Order.aggregate([{ $match: { status: "paid", paidAt: { $gte: from, $lt: to } } }, { $group: { _id: null, paise: { $sum: "$amountPaise" }, n: { $sum: 1 } } }]);
  const [cur, prev, statuses, users, users30, usersPrev, signups, recentOrders, recentUsers, pendingOld, failed7, disputed, openSupport, byPlan, activePaid] = await Promise.all([
    sum(d30, new Date(now + day)), sum(d60, d30),
    M.Order.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    M.User.countDocuments(), M.User.countDocuments({ createdAt: { $gte: d30 } }), M.User.countDocuments({ createdAt: { $gte: d60, $lt: d30 } }),
    M.User.aggregate([{ $match: { createdAt: { $gte: d30 } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } }]),
    M.Order.find().sort({ createdAt: -1 }).limit(6).populate("user", "email"), M.User.find({}, "email name createdAt").sort({ createdAt: -1 }).limit(6),
    M.Order.countDocuments({ status: "pending", createdAt: { $lt: hourAgo } }), M.Order.countDocuments({ status: "failed", createdAt: { $gte: d7 } }),
    M.Order.countDocuments({ status: "disputed" }), M.SupportRequest.countDocuments({ status: { $ne: "resolved" } }),
    M.Order.aggregate([{ $match: { status: "paid" } }, { $unwind: "$planIds" }, { $group: { _id: "$planIds", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
    M.Entitlement.countDocuments({ status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }),
  ]);
  const sg = new Map(signups.map((r: any) => [r._id, r.n]));
  const signupSeries = Array.from({ length: 30 }, (_, i) => { const d = new Date(d30.getTime() + (i + 1) * day).toISOString().slice(0, 10); return { date: d, n: sg.get(d) ?? 0 }; });
  const st = Object.fromEntries(statuses.map((s: any) => [s._id, s.n]));
  const revenue = cur[0]?.paise ?? 0, prevRevenue = prev[0]?.paise ?? 0;
  res.json({
    revenue: { paise: revenue, prevPaise: prevRevenue, orders: cur[0]?.n ?? 0, prevOrders: prev[0]?.n ?? 0 },
    users: { total: users, last30: users30, prev30: usersPrev }, activePaidEntitlements: activePaid,
    statuses: st, signupSeries, byPlan: byPlan.map((p: any) => ({ planId: p._id, n: p.n })),
    attention: { pendingOld, failed7, disputed, openSupport },
    recentOrders: recentOrders.map((o: any) => ({ id: o.id, title: o.title, email: o.user?.email ?? "deleted", amountPaise: o.amountPaise, status: o.status, createdAt: o.createdAt })),
    recentUsers: recentUsers.map((u: any) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })),
  });
}));

adminRouter.get("/revenue", wrap(async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }), req.query);
  const since = new Date(Date.now() - (days - 1) * 86400_000); since.setUTCHours(0, 0, 0, 0);
  const rows = await M.Order.aggregate([{ $match: { status: "paid", paidAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } }, paise: { $sum: "$amountPaise" }, orders: { $sum: 1 } } }]);
  const by = new Map(rows.map((r: any) => [r._id, r]));
  const series = Array.from({ length: days }, (_, i) => { const d = new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10); return { date: d, paise: by.get(d)?.paise ?? 0, orders: by.get(d)?.orders ?? 0 }; });
  res.json({ days, series });
}));

adminRouter.get("/promos", wrap(async (_req, res) => { res.json({ promos: await M.PromoCode.find().sort({ createdAt: -1 }).lean() }); }));
adminRouter.post("/promos", wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "3–20 letters, digits, - or _"), percentOff: z.number().int().min(1).max(90), maxUses: z.number().int().min(1).nullable().optional(), expiresAt: z.coerce.date().nullable().optional(), note: z.string().max(200).optional() }), req.body);
  try { const p = await M.PromoCode.create({ ...b, maxUses: b.maxUses ?? null, expiresAt: b.expiresAt ?? null }); await audit(req, "admin.promo_created", p.code, { percentOff: b.percentOff }); res.status(201).json({ promo: p }); }
  catch (e: any) { if (e?.code === 11000) throw badRequest("That code already exists"); throw e; }
}));
adminRouter.patch("/promos/:id", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Not found");
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const p = await M.PromoCode.findByIdAndUpdate(String(req.params.id), { active }, { new: true });
  if (!p) throw notFound("Not found");
  await audit(req, "admin.promo_toggled", p.code, { active });
  res.json({ promo: p });
}));

adminRouter.get("/orders", wrap(async (req, res) => {
  const q = parse(z.object({ status: z.string().max(20).optional(), q: z.string().max(80).optional() }), req.query);
  const f: any = {};
  if (q.status) f.status = q.status;
  if (q.q) {
    if (Types.ObjectId.isValid(q.q)) f.$or = [{ _id: q.q }, { user: q.q }];
    else { const u = await M.User.find({ email: new RegExp(escapeRegex(q.q), "i") }, "_id").limit(50); f.$or = [{ user: { $in: u.map((x) => x._id) } }, { receiptNo: q.q }]; }
  }
  const orders = await M.Order.find(f).sort({ createdAt: -1 }).limit(100).populate("user", "email name");
  res.json({ orders: orders.map((o: any) => ({ id: o.id, user: o.user ? { id: String(o.user._id), email: o.user.email } : null, title: o.title, amountPaise: o.amountPaise, status: o.status, provider: o.provider, receiptNo: o.receiptNo, createdAt: o.createdAt, paidAt: o.paidAt })) });
}));
adminRouter.get("/orders/:id", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Order not found");
  const o = await M.Order.findById(String(req.params.id)).populate("user", "email name");
  if (!o) throw notFound("Order not found");
  const [payments, ents] = await Promise.all([M.Payment.find({ order: o._id }).lean(), M.Entitlement.find({ order: o._id }).lean()]);
  res.json({ order: o, payments, entitlements: ents });
}));
adminRouter.post("/orders/:id/refund", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Order not found");
  await refundOrder(String(req.params.id), req);
  res.json({ ok: true });
}));

adminRouter.post("/entitlements/grant", wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), planId: z.string(), days: z.number().int().min(1).max(3650).optional() }), req.body);
  const plan = planById(b.planId);
  const user = await M.User.findOne({ email: b.email.toLowerCase() });
  if (!plan || plan.kind === "free") throw badRequest("Choose a paid plan");
  if (!user) throw notFound("User not found");
  const e = await M.Entitlement.create({ user: user._id, product: plan.product, planId: plan.id, kind: plan.kind, creditsRemaining: plan.credits ?? 0, source: "admin", order: null, expiresAt: plan.kind === "period" || b.days ? new Date(Date.now() + (b.days ?? plan.periodDays ?? 30) * 86400_000) : null });
  await audit(req, "admin.grant_entitlement", e.id, { email: b.email, planId: b.planId });
  res.status(201).json({ id: e.id });
}));
adminRouter.post("/entitlements/:id/revoke", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Not found");
  const e = await M.Entitlement.findByIdAndUpdate(String(req.params.id), { status: "revoked" });
  if (!e) throw notFound("Entitlement not found");
  await audit(req, "admin.revoke_entitlement", String(req.params.id));
  res.json({ ok: true });
}));
adminRouter.get("/users/:id/entitlements", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Not found");
  res.json({ entitlements: await M.Entitlement.find({ user: String(req.params.id) }).sort({ createdAt: -1 }).lean() });
}));

/* catalog management: price overrides, purchasable flags, product publication */
adminRouter.get("/catalog", wrap(async (_req, res) => { res.json(await effectiveCatalog()); }));
adminRouter.put("/catalog/plan/:id", wrap(async (req, res) => {
  const plan = planById(String(req.params.id));
  if (!plan || plan.kind === "free") throw notFound("Plan not found");
  const b = parse(z.object({ pricePaise: z.number().int().min(100).max(10_000_000).optional(), active: z.boolean().optional() }), req.body);
  await M.CatalogOverride.findOneAndUpdate({ key: plan.id }, b, { upsert: true });
  await audit(req, "admin.plan_update", plan.id, b);
  res.json({ ok: true });
}));
adminRouter.put("/catalog/product/:slug", wrap(async (req, res) => {
  if (!PRODUCTS.some((p) => p.slug === String(req.params.slug))) throw notFound("Product not found");
  const b = parse(z.object({ published: z.boolean() }), req.body);
  await M.CatalogOverride.findOneAndUpdate({ key: String(req.params.slug) }, b, { upsert: true });
  await audit(req, "admin.product_publish", String(req.params.slug), b);
  res.json({ ok: true });
}));

adminRouter.get("/support", wrap(async (_req, res) => {
  res.json({ items: await M.SupportRequest.find().sort({ createdAt: -1 }).limit(200).lean() });
}));
adminRouter.patch("/support/:id", wrap(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw notFound("Not found");
  const b = parse(z.object({ status: z.enum(["open", "in_progress", "resolved"]), adminNote: z.string().max(1000).optional() }), req.body);
  const r = await M.SupportRequest.findByIdAndUpdate(String(req.params.id), b, { new: true });
  if (!r) throw notFound("Not found");
  await audit(req, "admin.support_update", String(req.params.id), { status: b.status });
  res.json({ item: r });
}));
adminRouter.get("/audit", wrap(async (_req, res) => {
  res.json({ items: await M.AuditLog.find().sort({ createdAt: -1 }).limit(200).lean() });
}));
void PLANS;
