import Decimal from "decimal.js";
import { z } from "zod";

/* =========================================================================
 * MiniStock business rules shared by the API (authoritative) and the app (preview only).
 * All money is integer paise. The server ALWAYS recalculates; client totals are never trusted.
 * ========================================================================= */

export const BUSINESS_TZ_OFFSET = "+05:30"; // India. Reports and "today" use this business day.
export const PAYMENT_METHODS = ["cash", "upi", "card", "bank", "gateway", "credit"] as const;
export const CHANNELS = ["shop", "whatsapp", "instagram", "website", "other"] as const;
export const ORDER_STATUSES = ["draft", "confirmed", "packed", "shipped", "delivered", "cancelled", "partially_returned", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const RETURN_REASONS = ["defective", "wrong_item", "changed_mind", "other"] as const;
export const RETURN_CONDITIONS = ["restockable", "damaged", "pending"] as const;
export const EXPENSE_CATEGORIES = ["Rent", "Salaries & wages", "Packaging", "Delivery & courier", "Marketing", "Internet & utilities", "Damaged goods", "Bank & gateway fees", "Software", "Miscellaneous"] as const;
export const ADJUST_REASONS = ["correction", "damage", "loss", "found", "expired", "other"] as const;

/** Allowed forward moves of an order. Cancelling is a separate guarded action (it must reverse effects exactly once). */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  draft: ["confirmed"], confirmed: ["packed"], packed: ["shipped"], shipped: ["delivered"],
  delivered: [], cancelled: [], partially_returned: [], returned: [],
};
export const canMove = (from: OrderStatus, to: OrderStatus) => ORDER_FLOW[from]?.includes(to) ?? false;

/** Business day (IST) for a Date, as YYYY-MM-DD. */
export function businessDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
export function dayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00${BUSINESS_TZ_OFFSET}`);
  return { start, end: new Date(start.getTime() + 86400_000) };
}

/* ---------- sale totals ---------- */
export interface SaleLineIn { quantity: number; unitPricePaise: number; discountPaise: number; taxPercent: number }
export interface SaleLineOut { grossPaise: number; lineDiscountPaise: number; orderDiscountSharePaise: number; taxablePaise: number; taxPaise: number; totalPaise: number }
export interface SaleTotals { lines: SaleLineOut[]; subtotalPaise: number; orderDiscountPaise: number; taxablePaise: number; taxPaise: number; shippingPaise: number; totalPaise: number }

/**
 * Line Total = Quantity × Unit Price − Line Discount, then the order discount is shared across lines in proportion
 * to their value (remainder paise go to the last line so shares always add up), then tax is added per line (prices exclude tax).
 * Shipping is charged on top and is tracked separately from product revenue.
 */
export function calcSale(lines: SaleLineIn[], orderDiscountPaise = 0, shippingPaise = 0): SaleTotals {
  if (!lines.length) throw new Error("An order needs at least one line");
  const base = lines.map((l) => {
    const gross = l.quantity * l.unitPricePaise;
    if (l.discountPaise > gross) throw new Error("A line discount cannot exceed the line value");
    return { gross, disc: l.discountPaise, net: gross - l.discountPaise };
  });
  const subtotal = base.reduce((a, b) => a + b.net, 0);
  if (orderDiscountPaise > subtotal) throw new Error("The order discount cannot exceed the order subtotal");
  let allocated = 0;
  const out: SaleLineOut[] = lines.map((l, i) => {
    const isLast = i === lines.length - 1;
    const share = subtotal === 0 ? 0 : isLast ? orderDiscountPaise - allocated : Math.floor((orderDiscountPaise * base[i].net) / subtotal);
    allocated += share;
    const taxable = base[i].net - share;
    const tax = new Decimal(taxable).times(l.taxPercent).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    return { grossPaise: base[i].gross, lineDiscountPaise: base[i].disc, orderDiscountSharePaise: share, taxablePaise: taxable, taxPaise: tax, totalPaise: taxable + tax };
  });
  const taxable = out.reduce((a, l) => a + l.taxablePaise, 0), tax = out.reduce((a, l) => a + l.taxPaise, 0);
  return { lines: out, subtotalPaise: subtotal, orderDiscountPaise, taxablePaise: taxable, taxPaise: tax, shippingPaise, totalPaise: taxable + tax + shippingPaise };
}

/* ---------- reorder ---------- */
/** Reorder Point = Average Daily Demand × Lead Time + Safety Stock. */
export const reorderPoint = (avgDailyDemand: number, leadTimeDays: number, safetyStock: number) => Math.ceil(avgDailyDemand * leadTimeDays + safetyStock);
/**
 * Suggest a purchase when (available + already on order) falls to the reorder point.
 * Quantity brings projected stock up to the reorder point plus 14 days of demand. The seller must approve any purchase.
 */
export function suggestReorder(p: { available: number; incoming: number; avgDailyDemand: number; leadTimeDays: number; safetyStock: number; coverDays?: number }) {
  const rop = reorderPoint(p.avgDailyDemand, p.leadTimeDays, p.safetyStock);
  const projected = p.available + p.incoming;
  const target = rop + Math.ceil(p.avgDailyDemand * (p.coverDays ?? 14));
  return { reorderPoint: rop, projected, needed: projected <= rop, suggestedQty: projected <= rop ? Math.max(target - projected, 1) : 0 };
}

/* ---------- order balance ---------- */
/** What a customer still owes on an order. Negative means the seller owes the customer (credit). */
export function orderOutstanding(o: { totalPaise: number; returnedValuePaise: number; paidPaise: number; refundedPaise: number }) {
  return o.totalPaise - o.returnedValuePaise - (o.paidPaise - o.refundedPaise);
}

/* ---------- validation ---------- */
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().default("");
const qty = z.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(1_000_000);
const paise = z.number().int().min(0, "Amount cannot be negative").max(100_000_000_00);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

/** Guided "Add product" form. Prices and opening stock are validated on the server too. */
export const productFormSchema = z.object({
  name: text(120).min(1, "Product / design name is required"),
  category: optText(60),
  productType: optText(60),
  ageGroup: optText(30), design: optText(60), size: optText(20), colour: optText(30), variant: optText(40),
  sku: text(60).regex(/^[A-Za-z0-9._\/-]*$/, "Letters, digits and . _ / - only").optional().default(""),
  barcode: optText(40), supplier: optText(80),
  costPaise: paise, pricePaise: paise,
  openingQty: z.number().int("Opening stock must be a whole number").min(0, "Opening stock cannot be negative").max(10_000_000).default(0),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  taxPercent: z.number().min(0).max(100).default(0),
});
export type ProductForm = z.infer<typeof productFormSchema>;

const abbr = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, n);
/** Suggested SKU, e.g. HU-06M-WHI-FSH (design - age/size - colour - type). The seller can edit it. */
export function suggestSku(f: Pick<ProductForm, "name" | "ageGroup" | "size" | "colour" | "productType" | "variant">) {
  return [abbr(f.name, 2), abbr(f.ageGroup || f.size || f.variant, 3), abbr(f.colour, 3), abbr(f.productType, 3)].filter(Boolean).join("-");
}

export const orderLineSchema = z.object({
  itemId: objectId, quantity: qty,
  unitPricePaise: paise.optional(), // omitted → the product's current price
  discountPaise: paise.default(0),
});
export const paymentInSchema = z.object({
  method: z.enum(PAYMENT_METHODS), amountPaise: paise.refine((v) => v > 0, "Amount must be more than zero"),
  reference: optText(80), status: z.enum(["confirmed", "pending"]).default("confirmed"),
});
export const orderInputSchema = z.object({
  customerId: objectId.nullable().optional(),
  channel: z.enum(CHANNELS).default("shop"),
  lines: z.array(orderLineSchema).min(1, "Add at least one product").max(100),
  discountPaise: paise.default(0), shippingPaise: paise.default(0),
  /** "now": walk-in sale, stock leaves immediately. "later": online order, stock is reserved until it ships. */
  fulfilment: z.enum(["now", "later"]).default("now"),
  draft: z.boolean().default(false),
  cod: z.boolean().default(false),
  payments: z.array(paymentInSchema).max(5).default([]),
  notes: optText(300),
  key: text(80).optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const returnInputSchema = z.object({
  orderId: objectId,
  lines: z.array(z.object({ itemId: objectId, quantity: qty, reason: z.enum(RETURN_REASONS), condition: z.enum(RETURN_CONDITIONS).default("pending"), note: optText(200) })).min(1, "Select at least one item").max(100),
  refund: z.object({ method: z.enum(PAYMENT_METHODS), amountPaise: paise.optional() }).nullable().default(null),
  key: text(80).optional(),
});

export const customerSchema = z.object({ name: text(100).min(1, "Name is required"), phone: optText(30), address: optText(300), notes: optText(300), remindersConsent: z.boolean().default(false), paymentTermsDays: z.number().int().min(0).max(365).default(0) });
export const supplierSchema = z.object({ name: text(100).min(1, "Name is required"), businessName: optText(120), phone: optText(30), email: optText(120), address: optText(300), taxId: optText(40), paymentTermsDays: z.number().int().min(0).max(365).default(0), leadTimeDays: z.number().int().min(0).max(365).default(5), notes: optText(300) });
export const purchaseOrderSchema = z.object({
  supplierId: objectId, expectedDate: z.coerce.date().nullable().optional(), notes: optText(300),
  lines: z.array(z.object({ itemId: objectId, quantity: qty, unitCostPaise: paise })).min(1, "Add at least one product").max(100),
  status: z.enum(["draft", "ordered"]).default("ordered"),
});
export const receiveSchema = z.object({
  key: text(80).min(8, "A receipt key is required so the same delivery cannot be recorded twice"),
  supplierInvoice: optText(60),
  lines: z.array(z.object({ itemId: objectId, accepted: z.number().int().min(0).max(1_000_000), rejected: z.number().int().min(0).max(1_000_000).default(0), note: optText(200) })).min(1).max(100),
});
export const expenseSchema = z.object({ category: text(60).min(1, "Choose a category"), amountPaise: paise.refine((v) => v > 0, "Amount must be more than zero"), date: z.coerce.date(), account: z.enum(["cash", "upi", "bank", "card"]).default("cash"), note: optText(200) });
export const adjustSchema = z.object({
  itemId: objectId,
  mode: z.enum(["add", "remove", "set"]),
  quantity: z.number().int().min(0).max(10_000_000),
  reason: z.enum(ADJUST_REASONS),
  note: optText(200),
}).refine((v) => v.mode === "set" || v.quantity >= 1, { message: "Quantity must be at least 1", path: ["quantity"] })
  .refine((v) => v.mode === "add" || v.reason !== "found", { message: "“Found” can only add stock", path: ["reason"] });
export const stockCountSchema = z.object({ lines: z.array(z.object({ itemId: objectId, counted: z.number().int().min(0).max(10_000_000) })).min(1).max(2000), note: optText(200) });
export const cashCloseSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), openingPaise: paise, countedPaise: paise, note: optText(300) });
