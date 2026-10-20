import mongoose, { Schema, type InferSchemaType } from "mongoose";

const { ObjectId } = Schema.Types;
const opts = { timestamps: true } as const;
const model = <T extends Schema>(name: string, schema: T) => (mongoose.models[name] as mongoose.Model<InferSchemaType<T>>) ?? mongoose.model(name, schema);

/* ---------- identity ---------- */
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["customer", "admin"], default: "customer" },
  emailVerified: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  lastLoginAt: Date,
}, opts);
export const User = model("User", userSchema);

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  userAgent: String,
}, opts);
export const Session = model("Session", sessionSchema);

const resetSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: Date,
}, opts);
export const PasswordReset = model("PasswordReset", resetSchema);

const businessSchema = new Schema({
  owner: { type: ObjectId, ref: "User", required: true, unique: true },
  name: { type: String, required: true }, address: String, phone: String, email: String,
  taxId: String, taxLabel: { type: String, default: "GSTIN" }, logoDataUrl: String,
  invoicePrefix: { type: String, default: "INV" }, quotePrefix: { type: String, default: "QT" },
  defaultTaxPercent: { type: Number, default: 0 }, defaultNotes: String,
}, opts);
export const BusinessProfile = model("BusinessProfile", businessSchema);

/* ---------- commerce ---------- */
const orderSchema = new Schema({
  user: { type: ObjectId, ref: "User", index: true },
  userDeleted: { type: Boolean, default: false },
  itemType: { type: String, enum: ["plan", "bundle"], required: true },
  itemId: { type: String, required: true },
  title: String,
  planIds: [String],
  amountPaise: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["pending", "paid", "failed", "cancelled", "refunded", "disputed"], default: "pending", index: true },
  provider: { type: String, required: true },
  providerOrderId: { type: String, unique: true, sparse: true },
  receiptNo: { type: String, unique: true, sparse: true },
  paidAt: Date,
  refundedAt: Date,
  failureReason: String,
  promoCode: String,
  listPricePaise: Number,
  discountPaise: { type: Number, default: 0 },
}, opts);
export const Order = model("Order", orderSchema);

const paymentSchema = new Schema({
  order: { type: ObjectId, ref: "Order", required: true, index: true },
  provider: { type: String, required: true },
  providerPaymentId: { type: String, required: true, unique: true },
  amountPaise: { type: Number, required: true },
  status: { type: String, enum: ["captured", "failed", "amount_mismatch", "refunded", "disputed"], required: true },
  refundId: String,
}, opts);
export const Payment = model("Payment", paymentSchema);

const webhookSchema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  type: String,
  receivedAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 90 } },
});
webhookSchema.index({ provider: 1, eventId: 1 }, { unique: true });
export const WebhookEvent = model("WebhookEvent", webhookSchema);

const entitlementSchema = new Schema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  product: { type: String, required: true },
  planId: { type: String, required: true },
  kind: { type: String, enum: ["credits", "period", "one_time", "granted"], required: true },
  creditsRemaining: { type: Number, default: 0 },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ["active", "refunded", "suspended", "revoked"], default: "active" },
  order: { type: ObjectId, ref: "Order", default: null },
  source: { type: String, enum: ["purchase", "admin"], default: "purchase" },
}, opts);
entitlementSchema.index({ order: 1, planId: 1 }, { unique: true, partialFilterExpression: { order: { $type: "objectId" } } });
export const Entitlement = model("Entitlement", entitlementSchema);

const downloadSchema = new Schema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  assetId: { type: String, required: true },
  event: { type: String, enum: ["link_issued", "downloaded", "denied"], required: true },
  ip: String,
}, opts);
export const DownloadRecord = model("DownloadRecord", downloadSchema);

const overrideSchema = new Schema({
  key: { type: String, required: true, unique: true }, // plan id or product slug
  pricePaise: Number,
  active: Boolean, // plan purchasable?
  published: Boolean, // product visible?
}, opts);
export const CatalogOverride = model("CatalogOverride", overrideSchema);

/* ---------- invoices ---------- */
const counterSchema = new Schema({ owner: { type: ObjectId, required: true }, key: { type: String, required: true }, seq: { type: Number, default: 0 } });
counterSchema.index({ owner: 1, key: 1 }, { unique: true });
export const Counter = model("Counter", counterSchema);

const lineSchema = new Schema({
  description: String, quantity: Number, ratePaise: Number, taxPercent: Number,
  grossPaise: Number, discountPaise: Number, taxablePaise: Number, taxPaise: Number, totalPaise: Number,
}, { _id: false });
const invoiceSchema = new Schema({
  owner: { type: ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["invoice", "quotation"], required: true },
  number: { type: String, required: true },
  status: { type: String, enum: ["draft", "issued", "accepted", "rejected", "void"], default: "issued" },
  customer: { name: String, phone: String, email: String, address: String, taxId: String },
  issueDate: { type: Date, required: true },
  dueDate: Date,
  lines: [lineSchema],
  discount: { type: Schema.Types.Mixed, default: { type: "none" } },
  subtotalPaise: Number, discountPaise: Number, taxPaise: Number, totalPaise: Number,
  paidPaise: { type: Number, default: 0 },
  notes: String,
  template: { type: String, default: "classic" },
  revision: { type: Number, default: 1 },
  history: [{ revision: Number, at: Date, totalPaise: Number, snapshot: Schema.Types.Mixed, _id: false }],
  convertedFrom: { type: ObjectId, ref: "Invoice", default: null },
  convertedTo: { type: ObjectId, ref: "Invoice", default: null },
}, opts);
invoiceSchema.index({ owner: 1, kind: 1, number: 1 }, { unique: true });
invoiceSchema.index({ owner: 1, createdAt: -1 });
export const Invoice = model("Invoice", invoiceSchema);

/* ---------- inventory ---------- */
const itemSchema = new Schema({
  owner: { type: ObjectId, ref: "User", required: true },
  name: { type: String, required: true }, sku: { type: String, required: true },
  barcode: String, category: String, supplier: String,
  pricePaise: { type: Number, default: 0 }, costPaise: { type: Number, default: 0 },
  quantity: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 0 },
  expiryDate: Date, size: String, colour: String, variant: String,
  /** Stock promised to confirmed orders but not yet dispatched. Available = quantity (on hand) - reserved. */
  reserved: { type: Number, default: 0, min: 0 },
  attributes: { productType: String, ageGroup: String, design: String },
  taxPercent: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
}, opts);
itemSchema.index({ owner: 1, sku: 1 }, { unique: true });
itemSchema.index({ owner: 1, archived: 1, name: 1 });
export const InventoryItem = model("InventoryItem", itemSchema);

const movementSchema = new Schema({
  owner: { type: ObjectId, required: true, index: true },
  item: { type: ObjectId, ref: "InventoryItem", required: true, index: true },
  type: { type: String, enum: ["stock_in", "stock_out", "sale", "return", "damage", "adjustment", "opening", "purchase", "sale_reversal", "return_restock", "stocktake"], required: true },
  delta: { type: Number, required: true },
  qtyAfter: { type: Number, required: true },
  unitCostPaise: Number,
  note: String,
  reason: String,
  refType: String, refId: ObjectId,
  actor: { type: ObjectId, ref: "User" },
}, opts);
movementSchema.index({ owner: 1, createdAt: -1 });
export const StockMovement = model("StockMovement", movementSchema);

/* ---------- other products ---------- */
const resumeSchema = new Schema({ owner: { type: ObjectId, required: true, index: true }, title: String, template: String, data: Schema.Types.Mixed }, opts);
export const Resume = model("Resume", resumeSchema);

const invitationSchema = new Schema({ owner: { type: ObjectId, required: true, index: true }, title: String, data: Schema.Types.Mixed }, opts);
export const InvitationDesign = model("InvitationDesign", invitationSchema);

const pageSchema = new Schema({
  owner: { type: ObjectId, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  businessName: String, tagline: String, about: String, phone: String, whatsapp: String, email: String,
  website: String, address: String, mapUrl: String, hours: String, upiId: String,
  services: [{ name: String, price: String, description: String, _id: false }],
  accent: String, published: { type: Boolean, default: false }, publishedAt: Date,
}, opts);
export const MiniBusinessPage = model("MiniBusinessPage", pageSchema);

const supportSchema = new Schema({
  user: { type: ObjectId, ref: "User", default: null },
  name: String, email: String, subject: String, message: String, orderId: String,
  status: { type: String, enum: ["open", "in_progress", "resolved"], default: "open", index: true },
  adminNote: String,
}, opts);
export const SupportRequest = model("SupportRequest", supportSchema);

const auditSchema = new Schema({
  actor: { type: ObjectId, ref: "User", default: null },
  action: { type: String, required: true, index: true },
  target: String, meta: Schema.Types.Mixed, ip: String,
}, opts);
export const AuditLog = model("AuditLog", auditSchema);

const aiUsageSchema = new Schema({
  user: { type: ObjectId, required: true }, day: { type: String, required: true },
  requests: { type: Number, default: 0 }, inputTokens: { type: Number, default: 0 }, outputTokens: { type: Number, default: 0 },
});
aiUsageSchema.index({ user: 1, day: 1 }, { unique: true });
export const AiUsage = model("AiUsage", aiUsageSchema);

const promoSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  percentOff: { type: Number, required: true, min: 1, max: 90 },
  active: { type: Boolean, default: true },
  maxUses: { type: Number, default: null },
  uses: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  note: String,
}, opts);
export const PromoCode = model("PromoCode", promoSchema);

/* ---------- MiniStock: customers, suppliers, sales, returns, purchasing, finance ---------- */
const customerSchema = new Schema({
  owner: { type: ObjectId, required: true }, name: { type: String, required: true }, phone: String, address: String, notes: String,
  remindersConsent: { type: Boolean, default: false }, paymentTermsDays: { type: Number, default: 0 }, archived: { type: Boolean, default: false },
}, opts);
customerSchema.index({ owner: 1, archived: 1, name: 1 });
export const Customer = model("Customer", customerSchema);

const supplierSchema = new Schema({
  owner: { type: ObjectId, required: true }, name: { type: String, required: true }, businessName: String, phone: String, email: String, address: String, taxId: String,
  paymentTermsDays: { type: Number, default: 0 }, leadTimeDays: { type: Number, default: 5 }, notes: String, archived: { type: Boolean, default: false },
}, opts);
supplierSchema.index({ owner: 1, archived: 1, name: 1 });
export const Supplier = model("Supplier", supplierSchema);

/** Item lines keep a snapshot of what was sold (name, SKU, price, cost) so later edits never rewrite history. */
const saleLineSchema = new Schema({
  item: { type: ObjectId, ref: "InventoryItem", required: true }, sku: String, name: String,
  quantity: Number, unitPricePaise: Number, discountPaise: Number, orderDiscountSharePaise: Number, taxPercent: Number,
  taxablePaise: Number, taxPaise: Number, totalPaise: Number, unitCostPaise: Number,
  returnedQty: { type: Number, default: 0 },
}, { _id: false });
const saleOrderSchema = new Schema({
  owner: { type: ObjectId, required: true }, number: { type: String, required: true },
  idempotencyKey: String,
  customer: { type: ObjectId, ref: "Customer", default: null }, customerName: String,
  channel: { type: String, default: "shop" },
  status: { type: String, enum: ["draft", "confirmed", "packed", "shipped", "delivered", "cancelled", "partially_returned", "returned"], required: true },
  /** none: no stock effect yet; reserved: held for this order; deducted: stock has left; released: reservation freed (cancelled) ; restored: stock returned by a reversal */
  stockState: { type: String, enum: ["none", "reserved", "deducted", "released", "restored"], default: "none" },
  lines: [saleLineSchema],
  subtotalPaise: Number, discountPaise: Number, taxablePaise: Number, taxPaise: Number, shippingPaise: Number, totalPaise: Number,
  paidPaise: { type: Number, default: 0 }, refundedPaise: { type: Number, default: 0 }, returnedValuePaise: { type: Number, default: 0 },
  cod: { type: Boolean, default: false },
  courier: String, tracking: String, shippedAt: Date, deliveredAt: Date, packedAt: Date,
  notes: String, cancelledAt: Date, cancelReason: String,
  history: [{ status: String, at: Date, by: ObjectId, note: String, _id: false }],
  createdBy: ObjectId,
}, opts);
saleOrderSchema.index({ owner: 1, number: 1 }, { unique: true });
saleOrderSchema.index({ owner: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
saleOrderSchema.index({ owner: 1, createdAt: -1 });
saleOrderSchema.index({ owner: 1, status: 1 });
saleOrderSchema.index({ owner: 1, customer: 1 });
export const SaleOrder = model("SaleOrder", saleOrderSchema);

/** kind "payment" is money in, "refund" is money out. "pending" is NOT money received. Gateway-verified payments are flagged separately from seller-recorded ones. */
const salePaymentSchema = new Schema({
  owner: { type: ObjectId, required: true }, order: { type: ObjectId, ref: "SaleOrder", required: true }, customer: { type: ObjectId, default: null },
  kind: { type: String, enum: ["payment", "refund"], default: "payment" },
  method: { type: String, required: true }, amountPaise: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending", "confirmed", "failed"], default: "confirmed" },
  reference: String, verifiedByGateway: { type: Boolean, default: false },
  recordedBy: ObjectId, paidAt: Date, returnId: ObjectId,
}, opts);
salePaymentSchema.index({ owner: 1, order: 1, kind: 1, method: 1, reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: "string", $gt: "" } } });
salePaymentSchema.index({ owner: 1, paidAt: -1 });
export const SalePayment = model("SalePayment", salePaymentSchema);

const saleReturnSchema = new Schema({
  owner: { type: ObjectId, required: true }, number: String, order: { type: ObjectId, ref: "SaleOrder", required: true }, idempotencyKey: String,
  lines: [{ item: ObjectId, sku: String, name: String, quantity: Number, reason: String, condition: String, note: String, unitRefundPaise: Number, unitTaxablePaise: Number, unitCostPaise: Number, restocked: { type: Boolean, default: false }, _id: false }],
  refundDuePaise: { type: Number, default: 0 }, returnedValuePaise: { type: Number, default: 0 },
  createdBy: ObjectId,
}, opts);
saleReturnSchema.index({ owner: 1, createdAt: -1 });
saleReturnSchema.index({ owner: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
export const SaleReturn = model("SaleReturn", saleReturnSchema);

const purchaseOrderSchema = new Schema({
  owner: { type: ObjectId, required: true }, number: { type: String, required: true }, supplier: { type: ObjectId, ref: "Supplier", required: true }, supplierName: String,
  status: { type: String, enum: ["draft", "ordered", "partially_received", "received", "cancelled"], default: "ordered" },
  expectedDate: Date, notes: String, supplierInvoice: String,
  lines: [{ item: ObjectId, sku: String, name: String, orderedQty: Number, acceptedQty: { type: Number, default: 0 }, rejectedQty: { type: Number, default: 0 }, unitCostPaise: Number, _id: false }],
  receipts: [{ key: String, at: Date, by: ObjectId, supplierInvoice: String, lines: [{ item: ObjectId, accepted: Number, rejected: Number, note: String, _id: false }], _id: false }],
  payments: [{ amountPaise: Number, method: String, reference: String, at: Date, by: ObjectId, _id: false }],
  totalPaise: Number, receivedValuePaise: { type: Number, default: 0 }, paidPaise: { type: Number, default: 0 },
  dueDate: Date, rev: { type: Number, default: 0 },
}, opts);
purchaseOrderSchema.index({ owner: 1, number: 1 }, { unique: true });
purchaseOrderSchema.index({ owner: 1, status: 1 });
export const PurchaseOrder = model("PurchaseOrder", purchaseOrderSchema);

const expenseSchema = new Schema({
  owner: { type: ObjectId, required: true }, category: String, amountPaise: Number, date: Date, account: { type: String, default: "cash" }, note: String, createdBy: ObjectId,
}, opts);
expenseSchema.index({ owner: 1, date: -1 });
export const Expense = model("Expense", expenseSchema);

const stockCountSchema = new Schema({
  owner: { type: ObjectId, required: true }, number: String, status: { type: String, enum: ["draft", "posted", "cancelled"], default: "draft" }, note: String,
  lines: [{ item: ObjectId, sku: String, name: String, systemQty: Number, countedQty: Number, variance: Number, _id: false }],
  postedAt: Date, postedBy: ObjectId, createdBy: ObjectId,
}, opts);
stockCountSchema.index({ owner: 1, createdAt: -1 });
export const StockCount = model("StockCount", stockCountSchema);

const cashCloseSchema = new Schema({
  owner: { type: ObjectId, required: true }, date: { type: String, required: true },
  openingPaise: Number, cashInPaise: Number, cashOutPaise: Number, expectedPaise: Number, countedPaise: Number, differencePaise: Number, note: String, closedBy: ObjectId,
}, opts);
cashCloseSchema.index({ owner: 1, date: 1 }, { unique: true });
export const CashClose = model("CashClose", cashCloseSchema);
