import { Router } from "express";
import { z } from "zod";
import { businessProfileSchema, calculateDocument, invoiceInputSchema, paymentStatus, toCsv, type InvoiceInput } from "@ek/shared";
import { requireAuth } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound, parse, upgradeRequired, wrap } from "../lib/http.js";
import { escapeRegex, validImageDataUrl } from "../lib/security.js";
import { BusinessProfile, Counter, Invoice } from "../models/index.js";
import { getAccess, spendCredit } from "../services/access.js";
import { Types } from "mongoose";

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

/* ----- business profile ----- */
invoiceRouter.get("/business", wrap(async (req, res) => {
  res.json({ business: await BusinessProfile.findOne({ owner: req.user!._id }) });
}));
invoiceRouter.put("/business", wrap(async (req, res) => {
  const b = parse(businessProfileSchema, req.body);
  if (b.logoDataUrl && !validImageDataUrl(b.logoDataUrl)) throw badRequest("Logo is not a valid PNG, JPEG or WebP image");
  const doc = await BusinessProfile.findOneAndUpdate({ owner: req.user!._id }, { ...b, owner: req.user!._id }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json({ business: doc });
}));

/* ----- helpers ----- */
const view = (d: any) => {
  const o = d.toObject ? d.toObject() : d;
  return { ...o, id: String(o._id), _id: undefined, __v: undefined, history: undefined, historyCount: (o.history ?? []).length, paymentStatus: paymentStatus(o.totalPaise, o.paidPaise, o.dueDate) };
};

function compute(input: InvoiceInput) {
  let t;
  try { t = calculateDocument(input.lines, input.discount); } catch (e: any) { throw badRequest(e.message); }
  if (input.paidPaise > t.totalPaise) throw badRequest("Paid amount cannot exceed the total");
  return t;
}

async function nextNumber(owner: Types.ObjectId, kind: "invoice" | "quotation", prefix: string) {
  const c = await Counter.findOneAndUpdate({ owner, key: kind }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${String(c.seq).padStart(4, "0")}`;
}

async function assertTemplateAllowed(userId: Types.ObjectId, template: string) {
  if (template === "classic") return;
  if (!(await getAccess(userId, "invoice")).limits.premiumTemplates) throw upgradeRequired("Modern and Minimal templates come with Starter pack or Pro.", "invoice");
}

/** Enforces the monthly quota; spends a purchased credit when the free allowance is used up. Returns a refund fn. */
async function reserveDocumentSlot(userId: Types.ObjectId) {
  const access = await getAccess(userId, "invoice");
  const limit = access.limits.docsPerMonth;
  if (limit === null) return async () => {};
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const used = await Invoice.countDocuments({ owner: userId, createdAt: { $gte: monthStart } });
  if (used < Number(limit)) return async () => {};
  if (await spendCredit(userId, "invoice")) {
    return async () => { const { Entitlement } = await import("../models/index.js"); await Entitlement.updateOne({ user: userId, product: "invoice", kind: "credits", status: "active" }, { $inc: { creditsRemaining: 1 } }); };
  }
  throw upgradeRequired(`You have used your ${limit} free documents for this month. Buy a Starter pack or upgrade to Pro to continue.`, "invoice");
}

async function createDoc(userId: Types.ObjectId, input: InvoiceInput, extra: Record<string, unknown> = {}) {
  await assertTemplateAllowed(userId, input.template);
  const refund = await reserveDocumentSlot(userId);
  try {
    const totals = compute(input);
    const biz = await BusinessProfile.findOne({ owner: userId });
    if (!biz) throw new HttpError(412, "Set up your business profile before creating documents", "business_required");
    const prefix = input.kind === "invoice" ? biz.invoicePrefix ?? "INV" : biz.quotePrefix ?? "QT";
    for (let attempt = 0; attempt < 3; attempt++) {
      const number = await nextNumber(userId, input.kind, prefix);
      try {
        return await Invoice.create({
          owner: userId, kind: input.kind, number, status: input.issue ? "issued" : "draft", customer: input.customer,
          issueDate: input.issueDate, dueDate: input.dueDate ?? undefined,
          lines: input.lines.map((l, i) => ({ ...l, ...totals.lines[i] })), discount: input.discount,
          subtotalPaise: totals.subtotalPaise, discountPaise: totals.discountPaise, taxPaise: totals.taxPaise, totalPaise: totals.totalPaise,
          paidPaise: input.kind === "invoice" ? input.paidPaise : 0, notes: input.notes, template: input.template, ...extra,
        });
      } catch (e: any) { if (e?.code !== 11000) throw e; /* number collision: take the next one */ }
    }
    throw conflict("Could not allocate a unique document number, please retry");
  } catch (e) { await refund(); throw e; }
}

const oid = (id: string) => { if (!Types.ObjectId.isValid(id)) throw notFound("Document not found"); return new Types.ObjectId(id); };
const mine = async (req: any, id: string) => {
  const d = await Invoice.findOne({ _id: oid(id), owner: req.user._id });
  if (!d) throw notFound("Document not found");
  return d;
};

/* ----- CRUD ----- */
invoiceRouter.get("/", wrap(async (req, res) => {
  const q = parse(z.object({ kind: z.enum(["invoice", "quotation"]).optional(), q: z.string().max(80).optional(), status: z.string().max(20).optional() }), req.query);
  const filter: any = { owner: req.user!._id };
  if (q.kind) filter.kind = q.kind;
  if (q.status && q.status !== "all" && !["unpaid", "partial", "paid", "overdue"].includes(q.status)) filter.status = q.status;
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), "i"); filter.$or = [{ number: rx }, { "customer.name": rx }]; }
  const docs = await Invoice.find(filter).sort({ createdAt: -1 }).limit(500);
  let items = docs.map(view);
  if (q.status && ["unpaid", "partial", "paid", "overdue"].includes(q.status)) items = items.filter((d) => d.paymentStatus === q.status && d.kind === "invoice" && d.status !== "void");
  res.json({ items });
}));

/** Money-at-a-glance for the owner: what is owed, what is late, what came in this month. */
invoiceRouter.get("/summary", wrap(async (req, res) => {
  const docs = await Invoice.find({ owner: req.user!._id, kind: "invoice", status: { $in: ["issued", "draft"] } }, "totalPaise paidPaise dueDate status createdAt customer.name number");
  const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let outstanding = 0, overdue = 0, overdueCount = 0, billedMonth = 0; const late: any[] = [];
  for (const d of docs) {
    if (d.status === "draft") continue;
    const owed = (d.totalPaise ?? 0) - (d.paidPaise ?? 0);
    if (owed > 0) { outstanding += owed; if (d.dueDate && d.dueDate < now) { overdue += owed; overdueCount++; late.push({ id: String(d._id), number: d.number, customer: d.customer?.name, owedPaise: owed, dueDate: d.dueDate }); } }
    if ((d as any).createdAt >= monthStart) billedMonth += d.totalPaise ?? 0;
  }
  res.json({ outstandingPaise: outstanding, overduePaise: overdue, overdueCount, billedThisMonthPaise: billedMonth, late: late.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)).slice(0, 5), drafts: docs.filter((d) => d.status === "draft").length });
}));

invoiceRouter.get("/export.csv", wrap(async (req, res) => {
  const docs = (await Invoice.find({ owner: req.user!._id }).sort({ createdAt: -1 })).map(view);
  const rows: (string | number)[][] = [["number", "type", "status", "payment_status", "customer", "issue_date", "due_date", "subtotal", "discount", "tax", "total", "paid", "balance"]];
  const r = (p: number) => (p / 100).toFixed(2);
  for (const d of docs) rows.push([d.number, d.kind, d.status, d.kind === "invoice" ? d.paymentStatus : "", d.customer?.name ?? "", new Date(d.issueDate).toISOString().slice(0, 10), d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : "", r(d.subtotalPaise), r(d.discountPaise), r(d.taxPaise), r(d.totalPaise), r(d.paidPaise), r(d.totalPaise - d.paidPaise)]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="documents.csv"');
  res.send("﻿" + toCsv(rows));
}));

invoiceRouter.post("/", wrap(async (req, res) => {
  const input = parse(invoiceInputSchema, req.body);
  res.status(201).json({ item: view(await createDoc(req.user!._id, input)) });
}));

invoiceRouter.get("/:id", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  res.json({ item: { ...view(d), history: d.history } });
}));

invoiceRouter.put("/:id", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  if (d.status === "void") throw conflict("Voided documents cannot be edited");
  const input = parse(invoiceInputSchema, req.body);
  if (input.kind !== d.kind) throw badRequest("Document type cannot be changed");
  if (input.template !== d.template) await assertTemplateAllowed(req.user!._id, input.template);
  const totals = compute(input);
  // keep a revision snapshot of what was there before
  d.history.push({ revision: d.revision, at: new Date(), totalPaise: d.totalPaise ?? 0, snapshot: { customer: d.customer, lines: d.lines, discount: d.discount, notes: d.notes, issueDate: d.issueDate, dueDate: d.dueDate, paidPaise: d.paidPaise } });
  d.revision += 1;
  d.customer = input.customer as any; d.issueDate = input.issueDate; d.dueDate = input.dueDate ?? (undefined as any);
  d.lines = input.lines.map((l, i) => ({ ...l, ...totals.lines[i] })) as any; d.discount = input.discount;
  d.subtotalPaise = totals.subtotalPaise; d.discountPaise = totals.discountPaise; d.taxPaise = totals.taxPaise; d.totalPaise = totals.totalPaise;
  d.paidPaise = d.kind === "invoice" ? input.paidPaise : 0; d.notes = input.notes; d.template = input.template;
  if (d.status === "draft" && input.issue) d.status = "issued";
  await d.save();
  res.json({ item: view(d) });
}));

invoiceRouter.delete("/:id", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  if (d.status !== "draft") throw conflict("Issued documents are kept for your records – void it instead", "not_draft");
  await d.deleteOne();
  res.json({ ok: true });
}));

invoiceRouter.post("/:id/void", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  d.status = "void"; await d.save();
  res.json({ item: view(d) });
}));

invoiceRouter.post("/:id/payments", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  if (d.kind !== "invoice" || d.status === "void") throw conflict("Payments can only be recorded on active invoices");
  const { amountPaise } = parse(z.object({ amountPaise: z.number().int().positive() }), req.body);
  const r = await Invoice.findOneAndUpdate(
    { _id: d._id, owner: req.user!._id, $expr: { $lte: [{ $add: ["$paidPaise", amountPaise] }, "$totalPaise"] } },
    { $inc: { paidPaise: amountPaise } }, { new: true },
  );
  if (!r) throw badRequest("Payment exceeds the outstanding balance");
  res.json({ item: view(r) });
}));

invoiceRouter.post("/:id/duplicate", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  const input = invoiceInputSchema.parse({
    kind: d.kind, customer: d.customer, issueDate: new Date(), dueDate: null,
    lines: d.lines.map((l) => ({ description: l.description, quantity: l.quantity, ratePaise: l.ratePaise, taxPercent: l.taxPercent })),
    discount: d.discount, paidPaise: 0, notes: d.notes ?? "", template: d.template ?? "classic", issue: false,
  });
  res.status(201).json({ item: view(await createDoc(req.user!._id, input)) });
}));

invoiceRouter.post("/:id/accept", wrap(async (req, res) => {
  const d = await mine(req, String(req.params.id));
  if (d.kind !== "quotation" || !["issued", "draft"].includes(d.status)) throw conflict("Only open quotations can be accepted");
  d.status = "accepted"; await d.save();
  res.json({ item: view(d) });
}));

invoiceRouter.post("/:id/convert", wrap(async (req, res) => {
  const q = await mine(req, String(req.params.id));
  if (q.kind !== "quotation") throw conflict("Only quotations can be converted");
  if (q.status !== "accepted") throw conflict("Accept the quotation before converting it to an invoice", "not_accepted");
  if (q.convertedTo) throw conflict("This quotation was already converted", "already_converted");
  const input = invoiceInputSchema.parse({
    kind: "invoice", customer: q.customer, issueDate: new Date(), dueDate: null,
    lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, ratePaise: l.ratePaise, taxPercent: l.taxPercent })),
    discount: q.discount, paidPaise: 0, notes: q.notes ?? "", template: q.template ?? "classic", issue: true,
  });
  // claim the quotation atomically so a double-click cannot create two invoices
  const claimed = await Invoice.findOneAndUpdate({ _id: q._id, convertedTo: null }, { convertedTo: q._id });
  if (!claimed) throw conflict("This quotation was already converted", "already_converted");
  try {
    const inv = await createDoc(req.user!._id, input, { convertedFrom: q._id });
    await Invoice.updateOne({ _id: q._id }, { convertedTo: inv._id });
    res.status(201).json({ item: view(inv) });
  } catch (e) { await Invoice.updateOne({ _id: q._id }, { convertedTo: null }); throw e; }
}));
