import { Router } from "express";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { supportSchema } from "@ek/shared";
import { COOKIE, clearSessionCookie, requireAuth } from "../lib/auth.js";
import { forbidden, parse, unauthorized, wrap } from "../lib/http.js";
import * as M from "../models/index.js";
import { audit } from "../services/audit.js";
import { allAccess } from "../services/access.js";
import { daysUntil } from "@ek/shared";

export const accountRouter = Router();
accountRouter.use(requireAuth);

/** One call that powers the customer dashboard: usage, what needs attention, recent orders. */
accountRouter.get("/dashboard", wrap(async (req, res) => {
  const uid = req.user!._id; const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [docsMonth, docsTotal, openInv, items, resumes, designs, page, orders, access, ents] = await Promise.all([
    M.Invoice.countDocuments({ owner: uid, createdAt: { $gte: monthStart } }), M.Invoice.countDocuments({ owner: uid }),
    M.Invoice.find({ owner: uid, kind: "invoice", status: "issued" }, "number totalPaise paidPaise dueDate customer.name"),
    M.InventoryItem.find({ owner: uid, archived: false }, "name quantity reorderLevel expiryDate"),
    M.Resume.countDocuments({ owner: uid }), M.InvitationDesign.countDocuments({ owner: uid }), M.MiniBusinessPage.findOne({ owner: uid }, "slug published"),
    M.Order.find({ user: uid }).sort({ createdAt: -1 }).limit(4), allAccess(uid),
    M.Entitlement.find({ user: uid, status: "active", expiresAt: { $ne: null, $gt: now } }).lean(),
  ]);
  let outstanding = 0, overdue = 0, overdueCount = 0; const late: any[] = [];
  for (const d of openInv) { const owed = (d.totalPaise ?? 0) - (d.paidPaise ?? 0); if (owed <= 0) continue; outstanding += owed; if (d.dueDate && d.dueDate < now) { overdue += owed; overdueCount++; late.push({ number: d.number, customer: d.customer?.name, owedPaise: owed }); } }
  const low = items.filter((i) => i.reorderLevel > 0 && i.quantity <= i.reorderLevel);
  const expiring = items.filter((i) => i.expiryDate && i.quantity > 0 && daysUntil(i.expiryDate, now) >= 0 && daysUntil(i.expiryDate, now) <= 30);
  const expired = items.filter((i) => i.expiryDate && i.quantity > 0 && daysUntil(i.expiryDate, now) < 0);
  const soon = ents.filter((e) => e.expiresAt && daysUntil(e.expiresAt, now) <= 7).map((e) => ({ planId: e.planId, product: e.product, daysLeft: daysUntil(e.expiresAt!, now) }));
  res.json({
    usage: { docsMonth, docsTotal, items: items.length, resumes, designs, page: page ? { slug: page.slug, published: page.published } : null },
    money: { outstandingPaise: outstanding, overduePaise: overdue, overdueCount, late: late.slice(0, 3) },
    stock: { low: low.length, lowNames: low.slice(0, 3).map((i) => i.name), expiring: expiring.length, expired: expired.length },
    expiringPlans: soon,
    access: access.map((a) => ({ product: a.product, paid: a.paid, credits: a.credits, expiresAt: a.expiresAt, limits: a.limits, planIds: a.planIds })),
    orders: orders.map((o) => ({ id: o.id, title: o.title, amountPaise: o.amountPaise, status: o.status, createdAt: (o as any).createdAt })),
  });
}));

accountRouter.patch("/", wrap(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
  const u = await M.User.findByIdAndUpdate(req.user!._id, { name }, { new: true });
  res.json({ user: { id: u!.id, email: u!.email, name: u!.name, role: u!.role } });
}));

/** Data portability: everything we hold about the user as JSON. */
accountRouter.get("/export", wrap(async (req, res) => {
  const uid = req.user!._id;
  const [user, business, invoices, items, movements, resumes, invitations, page, orders, entitlements, downloads, support] = await Promise.all([
    M.User.findById(uid, "-passwordHash").lean(), M.BusinessProfile.findOne({ owner: uid }).lean(), M.Invoice.find({ owner: uid }).lean(),
    M.InventoryItem.find({ owner: uid }).lean(), M.StockMovement.find({ owner: uid }).lean(), M.Resume.find({ owner: uid }).lean(),
    M.InvitationDesign.find({ owner: uid }).lean(), M.MiniBusinessPage.findOne({ owner: uid }).lean(), M.Order.find({ user: uid }).lean(),
    M.Entitlement.find({ user: uid }).lean(), M.DownloadRecord.find({ user: uid }).lean(), M.SupportRequest.find({ user: uid }).lean(),
  ]);
  await audit(req, "account.export");
  res.setHeader("Content-Disposition", 'attachment; filename="everydaykit-data.json"');
  res.json({ exportedAt: new Date(), user, business, invoices, inventoryItems: items, stockMovements: movements, resumes, invitations, miniBusinessPage: page, orders, entitlements, downloads, supportRequests: support });
}));

/** Permanent deletion. Order/payment records are retained without a user link for accounting & refund obligations. */
accountRouter.delete("/", wrap(async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1).max(128), confirm: z.literal("DELETE") }), req.body);
  const u = await M.User.findById(req.user!._id);
  if (!u || !(await verify(u.passwordHash, password).catch(() => false))) throw unauthorized("Password is incorrect");
  if (u.role === "admin") throw forbidden("Administrator accounts cannot be self-deleted");
  const uid = u._id;
  await Promise.all([
    M.Session.deleteMany({ user: uid }), M.PasswordReset.deleteMany({ user: uid }), M.BusinessProfile.deleteMany({ owner: uid }), M.Invoice.deleteMany({ owner: uid }),
    M.Counter.deleteMany({ owner: uid }), M.InventoryItem.deleteMany({ owner: uid }), M.StockMovement.deleteMany({ owner: uid }), M.Resume.deleteMany({ owner: uid }),
    M.InvitationDesign.deleteMany({ owner: uid }), M.MiniBusinessPage.deleteMany({ owner: uid }), M.Entitlement.deleteMany({ user: uid }),
    M.DownloadRecord.deleteMany({ user: uid }), M.AiUsage.deleteMany({ user: uid }), M.SupportRequest.updateMany({ user: uid }, { user: null, name: "deleted", email: "deleted", }),
    M.Order.updateMany({ user: uid }, { userDeleted: true }),
  ]);
  await audit(req, "account.deleted", String(uid), undefined, null);
  await M.User.deleteOne({ _id: uid });
  clearSessionCookie(res);
  res.json({ ok: true });
}));
void COOKIE;

export const supportRouter = Router();
supportRouter.post("/", wrap(async (req, res) => {
  const b = parse(supportSchema, req.body);
  const r = await M.SupportRequest.create({ ...b, user: req.user?._id ?? null });
  res.status(201).json({ ok: true, id: r.id });
}));
supportRouter.get("/mine", requireAuth, wrap(async (req, res) => {
  const rows = await M.SupportRequest.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ items: rows.map((r) => ({ id: r.id, subject: r.subject, status: r.status, createdAt: (r as any).createdAt })) });
}));
