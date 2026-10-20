import { Types } from "mongoose";
import { businessDay, dayRange } from "@ek/shared";
import { CashClose, Customer, Expense, InventoryItem, PurchaseOrder, SaleOrder, SalePayment, SaleReturn, StockMovement } from "../models/index.js";
import { conflict } from "../lib/http.js";
import { reorderSuggestions } from "./purchasing.js";

type Owner = Types.ObjectId;
const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
/** The moment a sale counts as revenue: when stock actually leaves (dispatch, or the sale itself for walk-ins). */
const RECOGNISED = { $ifNull: ["$shippedAt", "$deliveredAt"] };
const live = (owner: Owner) => ({ owner, stockState: "deducted", status: { $ne: "cancelled" } });

/**
 * Definitions (also shown to the seller):
 *  Sales revenue      = line values after discounts, EXCLUDING tax and shipping, less returned goods.
 *  Cost of goods sold = quantity × unit cost at time of sale (weighted-average cost), less the cost of goods restocked from returns.
 *  Gross profit       = sales revenue - cost of goods sold.   (never revenue)
 *  Net profit estimate= gross profit + shipping charged - expenses.
 *  Cash received      = confirmed customer payments less confirmed refunds. Pending payments are NOT counted.
 *  Receivables        = what customers still owe on live orders.
 */
export const DEFINITIONS = {
  revenue: "Sales revenue = value of items sold after discounts, excluding tax and shipping, minus returned goods.",
  cogs: "Cost of goods = units sold × unit cost at the time of sale (weighted average), minus the cost of returned goods put back in stock.",
  grossProfit: "Gross profit = sales revenue − cost of goods. It is before rent, wages and other expenses.",
  netProfit: "Net profit estimate = gross profit + shipping charged − expenses in the period.",
  cash: "Cash received = confirmed customer payments − confirmed refunds. Pending payments are not counted.",
  receivables: "Receivables = money customers still owe on active orders.",
  inventoryValue: "Inventory value = on-hand quantity × weighted-average cost.",
};

export async function periodSummary(owner: Owner, from: Date, to: Date) {
  const inRange = { $expr: { $and: [{ $gte: [RECOGNISED, from] }, { $lt: [RECOGNISED, to] }] } };
  const [orders, lines, returns, expenses, pay] = await Promise.all([
    SaleOrder.aggregate([{ $match: { ...live(owner), ...inRange } }, { $group: { _id: null, orders: { $sum: 1 }, tax: { $sum: "$taxPaise" }, shipping: { $sum: "$shippingPaise" }, total: { $sum: "$totalPaise" } } }]),
    SaleOrder.aggregate([{ $match: { ...live(owner), ...inRange } }, { $unwind: "$lines" }, { $group: { _id: null, revenue: { $sum: "$lines.taxablePaise" }, cogs: { $sum: { $multiply: ["$lines.quantity", { $ifNull: ["$lines.unitCostPaise", 0] }] } }, units: { $sum: "$lines.quantity" } } }]),
    SaleReturn.aggregate([{ $match: { owner, createdAt: { $gte: from, $lt: to } } }, { $unwind: "$lines" }, { $group: { _id: null, revenue: { $sum: { $multiply: ["$lines.quantity", { $ifNull: ["$lines.unitTaxablePaise", 0] }] } }, restockedCost: { $sum: { $cond: ["$lines.restocked", { $multiply: ["$lines.quantity", { $ifNull: ["$lines.unitCostPaise", 0] }] }, 0] } }, units: { $sum: "$lines.quantity" } } }]),
    Expense.aggregate([{ $match: { owner, date: { $gte: from, $lt: to } } }, { $group: { _id: null, total: { $sum: "$amountPaise" } } }]),
    SalePayment.aggregate([{ $match: { owner, status: "confirmed", paidAt: { $gte: from, $lt: to } } }, { $group: { _id: "$kind", total: { $sum: "$amountPaise" } } }]),
  ]);
  const o = orders[0] ?? {}, l = lines[0] ?? {}, r = returns[0] ?? {}, e = expenses[0] ?? {};
  const revenue = (l.revenue ?? 0) - (r.revenue ?? 0);
  const cogs = (l.cogs ?? 0) - (r.restockedCost ?? 0);
  const grossProfit = revenue - cogs;
  const cashIn = pay.find((p: any) => p._id === "payment")?.total ?? 0, cashOut = pay.find((p: any) => p._id === "refund")?.total ?? 0;
  return {
    orders: o.orders ?? 0, units: (l.units ?? 0) - (r.units ?? 0), salesRevenuePaise: revenue, cogsPaise: cogs, grossProfitPaise: grossProfit,
    taxCollectedPaise: o.tax ?? 0, shippingChargedPaise: o.shipping ?? 0, returnsValuePaise: r.revenue ?? 0,
    expensesPaise: e.total ?? 0, netProfitPaise: grossProfit + (o.shipping ?? 0) - (e.total ?? 0),
    cashReceivedPaise: cashIn - cashOut, marginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
  };
}

export async function receivables(owner: Owner) {
  const rows = await SaleOrder.aggregate([
    { $match: { owner, status: { $nin: ["cancelled", "draft"] } } },
    { $addFields: { owing: { $subtract: [{ $subtract: ["$totalPaise", "$returnedValuePaise"] }, { $subtract: ["$paidPaise", "$refundedPaise"] }] } } },
    { $match: { owing: { $gt: 0 } } },
    { $project: { number: 1, customer: 1, customerName: 1, owing: 1, createdAt: 1 } },
  ]);
  return rows as { _id: Types.ObjectId; number: string; customer: Types.ObjectId | null; customerName: string; owing: number; createdAt: Date }[];
}
export async function payables(owner: Owner) {
  return PurchaseOrder.find({ owner, status: { $in: ["partially_received", "received"] }, $expr: { $gt: ["$receivedValuePaise", "$paidPaise"] } });
}

export async function dashboard(owner: Owner) {
  const today = businessDay(new Date()); const { start, end } = dayRange(today);
  const [day, items, recv, pays, pending, reorder] = await Promise.all([
    periodSummary(owner, start, end),
    InventoryItem.find({ owner, archived: false }),
    receivables(owner), payables(owner),
    SaleOrder.countDocuments({ owner, status: { $in: ["draft", "confirmed", "packed"] } }),
    reorderSuggestions(owner),
  ]);
  const low = items.filter((i) => i.reorderLevel > 0 && i.quantity - (i.reserved ?? 0) <= i.reorderLevel);
  const awaiting = await SaleOrder.countDocuments({ owner, status: { $in: ["confirmed", "packed"] } });
  const dueTotal = recv.reduce((a, r) => a + r.owing, 0);
  const overdue = recv.filter((r) => Date.now() - r.createdAt.getTime() > 7 * 86400_000);
  const supplierBills = pays.map((p: any) => ({ number: p.number, supplier: p.supplierName, balancePaise: p.receivedValuePaise - p.paidPaise, dueDate: p.dueDate }));
  const soon = supplierBills.filter((b) => b.dueDate && new Date(b.dueDate).getTime() - Date.now() < 7 * 86400_000);
  const alerts: { tone: "warn" | "bad" | "info"; text: string; to: string }[] = [];
  if (low.length) alerts.push({ tone: "warn", text: `${low.length} product${low.length > 1 ? "s" : ""} at or below the low-stock level`, to: "products" });
  if (reorder.length) alerts.push({ tone: "warn", text: `${reorder.length} product${reorder.length > 1 ? "s" : ""} reached the reorder point`, to: "buying" });
  if (awaiting) alerts.push({ tone: "info", text: `${awaiting} order${awaiting > 1 ? "s" : ""} waiting to be packed or dispatched`, to: "orders" });
  if (overdue.length) alerts.push({ tone: "bad", text: `${overdue.length} customer payment${overdue.length > 1 ? "s" : ""} overdue by more than 7 days`, to: "people" });
  if (soon.length) alerts.push({ tone: "warn", text: `${soon.length} supplier bill${soon.length > 1 ? "s" : ""} due within 7 days`, to: "buying" });
  return {
    today: { date: today, ...day }, lowStockCount: low.length, pendingOrders: pending, awaitingDispatch: awaiting,
    customerDuesPaise: dueTotal, overdueCount: overdue.length, supplierDuesPaise: supplierBills.reduce((a, b) => a + Math.max(0, b.balancePaise), 0),
    inventoryValuePaise: items.reduce((a, i) => a + i.quantity * i.costPaise, 0), alerts, definitions: DEFINITIONS,
  };
}

export async function cashPreview(owner: Owner, date: string) {
  const { start, end } = dayRange(date);
  const [pay, exp, last] = await Promise.all([
    SalePayment.aggregate([{ $match: { owner, status: "confirmed", method: "cash", paidAt: { $gte: start, $lt: end } } }, { $group: { _id: "$kind", total: { $sum: "$amountPaise" } } }]),
    Expense.aggregate([{ $match: { owner, account: "cash", date: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: "$amountPaise" } } }]),
    CashClose.findOne({ owner, date: { $lt: date } }).sort({ date: -1 }),
  ]);
  const cashIn = pay.find((p: any) => p._id === "payment")?.total ?? 0;
  const cashOut = (pay.find((p: any) => p._id === "refund")?.total ?? 0) + (exp[0]?.total ?? 0);
  const opening = last?.countedPaise ?? 0;
  return { date, openingPaise: opening, cashInPaise: cashIn, cashOutPaise: cashOut, expectedPaise: opening + cashIn - cashOut, note: "UPI, card and bank payments are reconciled separately from physical cash." };
}
export async function closeCash(owner: Owner, actor: Owner, p: { date: string; openingPaise: number; countedPaise: number; note?: string }) {
  const pre = await cashPreview(owner, p.date);
  const expected = p.openingPaise + pre.cashInPaise - pre.cashOutPaise;
  try {
    return await CashClose.create({ owner, date: p.date, openingPaise: p.openingPaise, cashInPaise: pre.cashInPaise, cashOutPaise: pre.cashOutPaise, expectedPaise: expected, countedPaise: p.countedPaise, differencePaise: p.countedPaise - expected, note: p.note, closedBy: actor });
  } catch (e: any) { if (e?.code === 11000) throw conflict("This day is already closed", "ALREADY_CLOSED"); throw e; }
}

/* ---------------- reports: each returns columns + rows so the app and CSV export share one definition ---------------- */
export interface Report { title: string; note: string; columns: { key: string; label: string; money?: boolean }[]; rows: Record<string, string | number>[]; totals?: Record<string, number> }

export async function buildReport(owner: Owner, kind: string, from: Date, to: Date): Promise<Report> {
  if (kind === "sales") {
    const rows = await SaleOrder.aggregate([
      { $match: { ...live(owner), $expr: { $and: [{ $gte: [RECOGNISED, from] }, { $lt: [RECOGNISED, to] }] } } },
      { $addFields: { at: RECOGNISED } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "+05:30" } }, orders: { $sum: 1 }, revenue: { $sum: "$taxablePaise" }, tax: { $sum: "$taxPaise" }, shipping: { $sum: "$shippingPaise" } } },
      { $sort: { _id: 1 } },
    ]);
    const out = rows.map((r: any) => ({ date: r._id, orders: r.orders, revenue: r.revenue, tax: r.tax, shipping: r.shipping }));
    return { title: "Daily sales", note: DEFINITIONS.revenue + " Returns are shown in the Returns report.", columns: [{ key: "date", label: "Date" }, { key: "orders", label: "Orders" }, { key: "revenue", label: "Sales revenue", money: true }, { key: "tax", label: "Tax collected", money: true }, { key: "shipping", label: "Shipping charged", money: true }], rows: out, totals: { orders: sum(out, "orders"), revenue: sum(out, "revenue"), tax: sum(out, "tax"), shipping: sum(out, "shipping") } };
  }
  if (kind === "products") {
    const sold = await SaleOrder.aggregate([
      { $match: { ...live(owner), $expr: { $and: [{ $gte: [RECOGNISED, from] }, { $lt: [RECOGNISED, to] }] } } }, { $unwind: "$lines" },
      { $group: { _id: "$lines.item", units: { $sum: "$lines.quantity" }, revenue: { $sum: "$lines.taxablePaise" }, cogs: { $sum: { $multiply: ["$lines.quantity", { $ifNull: ["$lines.unitCostPaise", 0] }] } } } },
    ]);
    const items = await InventoryItem.find({ owner, archived: false });
    const days = Math.max(1, (to.getTime() - from.getTime()) / 86400_000);
    const by = new Map(sold.map((s: any) => [String(s._id), s]));
    const rows = items.map((i) => { const s: any = by.get(String(i._id)) ?? { units: 0, revenue: 0, cogs: 0 }; const per = s.units / days; return { sku: i.sku, name: i.name, units: s.units, revenue: s.revenue, profit: s.revenue - s.cogs, marginPct: s.revenue ? Math.round(((s.revenue - s.cogs) / s.revenue) * 1000) / 10 : 0, onHand: i.quantity, daysOfStock: per > 0 ? Math.round(i.quantity / per) : 0 }; }).sort((a, b) => b.profit - a.profit);
    return { title: "Product performance", note: "Best sellers first. “Days of stock” is on-hand stock ÷ the selling pace in this period (0 means nothing sold). Slow movers have stock but no or few sales.", columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "units", label: "Units sold" }, { key: "revenue", label: "Revenue", money: true }, { key: "profit", label: "Gross profit", money: true }, { key: "marginPct", label: "Margin %" }, { key: "onHand", label: "On hand" }, { key: "daysOfStock", label: "Days of stock" }], rows, totals: { units: sum(rows, "units"), revenue: sum(rows, "revenue"), profit: sum(rows, "profit") } };
  }
  if (kind === "stock") {
    const items = await InventoryItem.find({ owner, archived: false }).sort({ name: 1 });
    const rows = items.map((i) => ({ sku: i.sku, name: i.name, onHand: i.quantity, reserved: i.reserved ?? 0, available: i.quantity - (i.reserved ?? 0), unitCost: i.costPaise, value: i.quantity * i.costPaise }));
    return { title: "Stock valuation", note: DEFINITIONS.inventoryValue, columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "onHand", label: "On hand" }, { key: "reserved", label: "Reserved" }, { key: "available", label: "Available" }, { key: "unitCost", label: "Avg cost", money: true }, { key: "value", label: "Value", money: true }], rows, totals: { value: sum(rows, "value"), onHand: sum(rows, "onHand") } };
  }
  if (kind === "receivables") {
    const recv = await receivables(owner);
    const rows = recv.map((r) => ({ order: r.number, customer: r.customerName || "Walk-in customer", owing: r.owing, daysOld: Math.floor((Date.now() - r.createdAt.getTime()) / 86400_000) })).sort((a, b) => b.daysOld - a.daysOld);
    return { title: "Customer dues", note: DEFINITIONS.receivables, columns: [{ key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "owing", label: "Owes", money: true }, { key: "daysOld", label: "Days old" }], rows, totals: { owing: sum(rows, "owing") } };
  }
  if (kind === "payables") {
    const p = await payables(owner);
    const rows = p.map((x) => ({ po: x.number, supplier: x.supplierName ?? "", invoice: x.supplierInvoice ?? "", owing: x.receivedValuePaise! - x.paidPaise!, due: x.dueDate ? x.dueDate.toISOString().slice(0, 10) : "" }));
    return { title: "Supplier dues", note: "Supplier dues = value of goods accepted minus payments made.", columns: [{ key: "po", label: "Purchase order" }, { key: "supplier", label: "Supplier" }, { key: "invoice", label: "Invoice" }, { key: "owing", label: "You owe", money: true }, { key: "due", label: "Due date" }], rows, totals: { owing: sum(rows, "owing") } };
  }
  if (kind === "expenses") {
    const e = await Expense.aggregate([{ $match: { owner, date: { $gte: from, $lt: to } } }, { $group: { _id: "$category", total: { $sum: "$amountPaise" }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]);
    const rows = e.map((x: any) => ({ category: x._id, entries: x.count, total: x.total }));
    return { title: "Expenses by category", note: "Where your money is going in this period.", columns: [{ key: "category", label: "Category" }, { key: "entries", label: "Entries" }, { key: "total", label: "Total", money: true }], rows, totals: { total: sum(rows, "total") } };
  }
  if (kind === "returns") {
    const r = await SaleReturn.aggregate([{ $match: { owner, createdAt: { $gte: from, $lt: to } } }, { $unwind: "$lines" }, { $group: { _id: { reason: "$lines.reason", condition: "$lines.condition" }, units: { $sum: "$lines.quantity" }, value: { $sum: { $multiply: ["$lines.quantity", { $ifNull: ["$lines.unitRefundPaise", 0] }] } } } }]);
    const rows = r.map((x: any) => ({ reason: x._id.reason, condition: x._id.condition, units: x.units, value: x.value }));
    return { title: "Returns and refunds", note: "A refund and a restock are separate: only restockable items go back on the shelf.", columns: [{ key: "reason", label: "Reason" }, { key: "condition", label: "Condition" }, { key: "units", label: "Units" }, { key: "value", label: "Value", money: true }], rows, totals: { units: sum(rows, "units"), value: sum(rows, "value") } };
  }
  if (kind === "movements") {
    const m = await StockMovement.find({ owner, createdAt: { $gte: from, $lt: to } }).sort({ createdAt: -1 }).limit(5000).populate("item", "name sku");
    const rows = m.map((x: any) => ({ date: x.createdAt.toISOString().slice(0, 16).replace("T", " "), sku: x.item?.sku ?? "", name: x.item?.name ?? "", type: x.type, change: x.delta, after: x.qtyAfter, reason: x.reason ?? x.note ?? "" }));
    return { title: "Inventory movement", note: "Every stock change with its reason. Nothing changes without a record.", columns: [{ key: "date", label: "When" }, { key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "type", label: "Type" }, { key: "change", label: "Change" }, { key: "after", label: "After" }, { key: "reason", label: "Reason" }], rows };
  }
  throw conflict("Unknown report", "UNKNOWN_REPORT");
}

export async function customerLedger(owner: Owner, customerId: string) {
  const customer = await Customer.findOne({ _id: customerId, owner });
  if (!customer) return null;
  const orders = await SaleOrder.find({ owner, customer: customer._id }).sort({ createdAt: -1 }).limit(500);
  const payments = await SalePayment.find({ owner, customer: customer._id }).sort({ createdAt: -1 }).limit(500);
  const live = orders.filter((o) => !["cancelled", "draft"].includes(o.status));
  const purchases = live.reduce((a, o) => a + o.totalPaise!, 0), returns = live.reduce((a, o) => a + o.returnedValuePaise, 0);
  const received = live.reduce((a, o) => a + o.paidPaise - o.refundedPaise, 0);
  return { customer, orders, payments, totals: { purchasesPaise: purchases, returnsPaise: returns, paidPaise: received, outstandingPaise: Math.max(0, purchases - returns - received) } };
}
