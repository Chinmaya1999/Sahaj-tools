import { describe, expect, it } from "vitest";
import { business, signup } from "./helpers.js";

/**
 * "Oqzra Kids Wear": a realistic demo shop run through the real API.
 * Every expected figure is computed here with plain arithmetic (not by the app's own code),
 * so a mismatch means the app's accounting is wrong.
 */
type C = Awaited<ReturnType<typeof signup>>["c"];
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
interface L { qty: number; price: number; disc?: number; tax: number }
/** Independent order maths: line net → proportional order discount (remainder to last line) → tax per line, half-up. */
function calc(lines: L[], orderDisc = 0, ship = 0) {
  const net = lines.map((l) => l.qty * l.price - (l.disc ?? 0)); const sub = sum(net); let alloc = 0;
  const out = lines.map((l, i) => {
    const share = i === lines.length - 1 ? orderDisc - alloc : Math.floor((orderDisc * net[i]) / sub); alloc += share;
    const taxable = net[i] - share; const tax = Math.floor((taxable * l.tax + 50) / 100);
    return { taxable, tax, total: taxable + tax };
  });
  return { lines: out, taxable: sum(out.map((o) => o.taxable)), tax: sum(out.map((o) => o.tax)), ship, total: sum(out.map((o) => o.total)) + ship };
}
const wavg = (q0: number, c0: number, q1: number, c1: number) => Math.round((q0 * c0 + q1 * c1) / (q0 + q1));

const P = {
  hu06: { name: "Hu Shirt", ageGroup: "0-6 months", colour: "White", productType: "Full sleeve shirt", sku: "HU-06M-WHI", costPaise: 50000, pricePaise: 79900, taxPercent: 5, openingQty: 20, reorderLevel: 5, supplier: "Fab Co" },
  hu612: { name: "Hu Shirt", ageGroup: "6-12 months", colour: "Blue", productType: "Full sleeve shirt", sku: "HU-612M-BLU", costPaise: 52000, pricePaise: 84900, taxPercent: 5, openingQty: 15, reorderLevel: 5 },
  frock: { name: "Party Frock", ageGroup: "1-2 years", colour: "Pink", productType: "Frock", sku: "FR-1Y-PNK", costPaise: 90000, pricePaise: 149900, taxPercent: 12, openingQty: 10, reorderLevel: 7 },
  socks: { name: "Socks Pack", ageGroup: "Free", colour: "Mixed", productType: "Socks", sku: "SK-PACK", costPaise: 8000, pricePaise: 14900, taxPercent: 12, openingQty: 40, reorderLevel: 10 },
};
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

describe("demo business: a full day at Oqzra Kids Wear", () => {
  it("reconciles stock, sales, payments, returns, purchasing, profit, dues and cash to the paisa", async () => {
    const { c } = await signup("Demo Owner");
    const post = async (url: string, body?: unknown, status = 201) => { const r = await c.post(url).send(body ?? {}); expect(r.status, `${url} ${JSON.stringify(r.body).slice(0, 200)}`).toBe(status); return r.body; };
    const get = async (url: string) => { const r = await c.get(url); expect(r.status, url).toBe(200); return r.body; };

    /* ---------- set-up: products, people ---------- */
    const id: Record<string, string> = {};
    for (const [k, p] of Object.entries(P)) id[k] = (await post("/api/ministock/products", p)).product.id;
    const fab = (await post("/api/ministock/suppliers", { name: "Fab Co", leadTimeDays: 5, paymentTermsDays: 15 })).supplier;
    const ravi = (await post("/api/ministock/customers", { name: "Ravi Kumar", phone: "9876543210" })).customer._id;
    const meera = (await post("/api/ministock/customers", { name: "Meera Das", phone: "9123456780", remindersConsent: true })).customer._id;
    const suresh = (await post("/api/ministock/customers", { name: "Suresh Nayak" })).customer._id;

    /* ---------- purchasing: partial deliveries, a rejected piece, weighted-average cost ---------- */
    const po = (await post("/api/ministock/purchase-orders", { supplierId: fab._id, lines: [{ itemId: id.hu06, quantity: 30, unitCostPaise: 56000 }] })).purchaseOrder;
    let stock = (await get("/api/ministock/products")).products.find((p: any) => p.id === id.hu06);
    expect(stock.onHand, "a purchase order alone must not add stock").toBe(20);
    await post(`/api/ministock/purchase-orders/${po.id}/receive`, { key: "demo-delivery-1", supplierInvoice: "FAB-77", lines: [{ itemId: id.hu06, accepted: 18, rejected: 2 }] });
    await post(`/api/ministock/purchase-orders/${po.id}/receive`, { key: "demo-delivery-2", lines: [{ itemId: id.hu06, accepted: 10, rejected: 0 }] });
    const avg1 = wavg(20, 50000, 18, 56000), avg2 = wavg(38, avg1, 10, 56000);
    stock = (await get("/api/ministock/products")).products.find((p: any) => p.id === id.hu06);
    expect(stock.onHand).toBe(48); expect(stock.costPaise, "weighted-average cost").toBe(avg2);
    const cost = { hu06: avg2, hu612: 52000, frock: 90000, socks: 8000 };
    const poAfter = (await get(`/api/ministock/purchase-orders/${po.id}`)).purchaseOrder;
    expect(poAfter.status, "28 accepted + 2 rejected accounts for all 30 ordered").toBe("received");
    expect(poAfter.receivedValuePaise).toBe(28 * 56000);
    await post(`/api/ministock/purchase-orders/${po.id}/payments`, { amountPaise: 1000000, method: "bank", reference: "NEFT-1" });

    /* ---------- sales ---------- */
    const ord = async (body: unknown) => (await post("/api/ministock/orders", body)).order;
    const expRecognised: { c: ReturnType<typeof calc>; cogs: number }[] = [];
    const pay = (o: string, body: unknown, status = 201) => post(`/api/ministock/orders/${o}/payments`, body, status);

    // O1 walk-in, two products, paid in cash
    const c1 = calc([{ qty: 2, price: 79900, tax: 5 }, { qty: 3, price: 14900, tax: 12 }]);
    const O1 = await ord({ lines: [{ itemId: id.hu06, quantity: 2 }, { itemId: id.socks, quantity: 3 }], payments: [{ method: "cash", amountPaise: c1.total }], key: "demo-o1" });
    expect(O1.totalPaise).toBe(c1.total); expect(O1.taxPaise).toBe(c1.tax); expect(O1.outstandingPaise).toBe(0);
    expRecognised.push({ c: c1, cogs: 2 * cost.hu06 + 3 * cost.socks });

    // O2 credit customer: line discount, order discount, shipping, part-payment by UPI (+ a pending and a failed attempt that must not count)
    const c2 = calc([{ qty: 1, price: 149900, disc: 10000, tax: 12 }], 5000, 4000);
    const O2 = await ord({ customerId: ravi, channel: "whatsapp", lines: [{ itemId: id.frock, quantity: 1, discountPaise: 10000 }], discountPaise: 5000, shippingPaise: 4000, payments: [{ method: "upi", amountPaise: 100000, reference: "UPI-R1" }] });
    expect(O2.totalPaise).toBe(c2.total); expect(O2.outstandingPaise).toBe(c2.total - 100000);
    const pend = (await pay(O2.id, { method: "upi", amountPaise: 10000, reference: "UPI-R2", status: "pending" })).payment;
    const failedP = (await pay(O2.id, { method: "upi", amountPaise: 5000, reference: "UPI-R3", status: "pending" })).payment;
    await post(`/api/ministock/payments/${failedP.id}/fail`, {}, 200);
    expect((await get(`/api/ministock/orders/${O2.id}`)).order.paidPaise, "pending/failed payments are not money received").toBe(100000);
    expRecognised.push({ c: c2, cogs: cost.frock });

    // O3 online order: reserve → pack with scans → ship → deliver; paid in three instalments
    const c3 = calc([{ qty: 3, price: 84900, tax: 5 }], 0, 6000);
    const O3 = await ord({ customerId: meera, channel: "instagram", fulfilment: "later", lines: [{ itemId: id.hu612, quantity: 3 }], shippingPaise: 6000, payments: [{ method: "upi", amountPaise: 50000, reference: "UPI-M1" }] });
    expect(O3.status).toBe("confirmed");
    let p612 = (await get("/api/ministock/products")).products.find((p: any) => p.id === id.hu612);
    expect(p612).toMatchObject({ onHand: 15, reserved: 3, available: 12 });
    expect((await c.post(`/api/ministock/orders/${O3.id}/pack`).send({ scans: ["HU-612M-BLU", "HU-612M-BLU", "SK-PACK"] })).body.code, "wrong item scanned").toBe("PACK_MISMATCH");
    await post(`/api/ministock/orders/${O3.id}/pack`, { scans: Array(3).fill("HU-612M-BLU") }, 200);
    await post(`/api/ministock/orders/${O3.id}/ship`, { courier: "DTDC", tracking: "D123456" }, 200);
    await post(`/api/ministock/orders/${O3.id}/deliver`, {}, 200);
    const pend3 = (await pay(O3.id, { method: "upi", amountPaise: 20000, reference: "UPI-M2", status: "pending" })).payment;
    await post(`/api/ministock/payments/${pend3.id}/confirm`, {}, 200);
    const restM = c3.total - 70000;
    await pay(O3.id, { method: "cash", amountPaise: restM });
    expect((await pay(O3.id, { method: "cash", amountPaise: 1 }, 409)).code).toBe("OVERPAYMENT");
    expect((await get(`/api/ministock/orders/${O3.id}`)).order).toMatchObject({ status: "delivered", totalPaise: c3.total, paidPaise: c3.total, outstandingPaise: 0 });
    expRecognised.push({ c: c3, cogs: 3 * cost.hu612 });

    // O4 online order that is cancelled before dispatch → reservation released, nothing recognised
    const O4 = await ord({ fulfilment: "later", lines: [{ itemId: id.hu06, quantity: 5 }] });
    expect((await get("/api/ministock/products")).products.find((p: any) => p.id === id.hu06).reserved).toBe(5);
    await post(`/api/ministock/orders/${O4.id}/cancel`, { reason: "customer changed mind" }, 200);
    await post(`/api/ministock/orders/${O4.id}/cancel`, { reason: "again" }, 409);

    // O5 walk-in with an order discount
    const c5 = calc([{ qty: 10, price: 14900, tax: 12 }], 2000);
    const O5 = await ord({ lines: [{ itemId: id.socks, quantity: 10 }], discountPaise: 2000, payments: [{ method: "cash", amountPaise: c5.total }] });
    expect(O5.totalPaise).toBe(c5.total); expRecognised.push({ c: c5, cogs: 10 * cost.socks });

    // O6 pure credit sale: nothing paid
    const c6 = calc([{ qty: 2, price: 84900, tax: 5 }]);
    const O6 = await ord({ customerId: suresh, lines: [{ itemId: id.hu612, quantity: 2 }] });
    expect(O6).toMatchObject({ totalPaise: c6.total, paidPaise: 0, outstandingPaise: c6.total }); expRecognised.push({ c: c6, cogs: 2 * cost.hu612 });

    // O7 card sale
    const c7 = calc([{ qty: 2, price: 149900, tax: 12 }]);
    const O7 = await ord({ lines: [{ itemId: id.frock, quantity: 2 }], payments: [{ method: "card", amountPaise: c7.total, reference: "CARD-1" }] });
    expRecognised.push({ c: c7, cogs: 2 * cost.frock });

    // O8 online order with an advance, then cancelled → advance becomes a PENDING refund (not yet money out)
    const O8 = await ord({ fulfilment: "later", lines: [{ itemId: id.socks, quantity: 2 }], payments: [{ method: "upi", amountPaise: 10000, reference: "UPI-X" }] });
    await post(`/api/ministock/orders/${O8.id}/cancel`, { reason: "out of area" }, 200);
    const pendingRefunds = (await get("/api/ministock/payments?kind=refund&status=pending")).payments;
    expect(pendingRefunds).toHaveLength(1); expect(pendingRefunds[0].amountPaise).toBe(10000);

    /* ---------- returns: restockable vs damaged; refund ≠ restock ---------- */
    const r1Value = Math.round((c1.lines[0].total * 1) / 2); // 1 of 2 shirts on O1
    const R1 = (await post("/api/ministock/returns", { orderId: O1.id, refund: { method: "cash" }, lines: [{ itemId: id.hu06, quantity: 1, reason: "wrong_item", condition: "restockable" }] })).return;
    expect(R1.returnedValuePaise).toBe(r1Value);
    const r2Value = Math.round((c7.lines[0].total * 1) / 2);
    await post("/api/ministock/returns", { orderId: O7.id, refund: { method: "card" }, lines: [{ itemId: id.frock, quantity: 1, reason: "defective", condition: "damaged" }] });
    expect((await get(`/api/ministock/orders/${O1.id}`)).order).toMatchObject({ status: "partially_returned", refundedPaise: r1Value, outstandingPaise: 0 });
    const r1Taxable = Math.round((c1.lines[0].taxable * 1) / 2), r2Taxable = Math.round((c7.lines[0].taxable * 1) / 2);

    /* ---------- expenses, a damage write-off, a stock count ---------- */
    await post("/api/ministock/expenses", { category: "Packaging", amountPaise: 12000, date: new Date().toISOString(), account: "cash" });
    await post("/api/ministock/expenses", { category: "Rent", amountPaise: 500000, date: new Date().toISOString(), account: "bank" });
    await post("/api/ministock/stock/adjust", { itemId: id.socks, mode: "remove", quantity: 4, reason: "damage", note: "water damage" });
    const count = (await post("/api/ministock/stock-counts", { lines: [{ itemId: id.hu612, counted: 9 }] })).count;
    expect(count.lines[0]).toMatchObject({ systemQty: 10, countedQty: 9, variance: -1 });
    await post(`/api/ministock/stock-counts/${count._id}/post`, { confirm: true }, 200);

    /* ===================== reconciliation ===================== */
    const final = (await get("/api/ministock/products?limit=100")).products as any[];
    const by = (sku: string) => final.find((p) => p.sku === sku);
    expect([by("HU-06M-WHI").onHand, by("HU-612M-BLU").onHand, by("FR-1Y-PNK").onHand, by("SK-PACK").onHand]).toEqual([48 - 2 + 1, 15 - 3 - 2 - 1, 10 - 1 - 2, 40 - 3 - 10 - 4]);
    expect(final.every((p) => p.reserved === 0), "no reservations left once every order is shipped or cancelled").toBe(true);

    // Ledger integrity: for every product the movement history adds up to the on-hand quantity
    const moves = (await get("/api/inventory/movements?limit=500")).movements as any[];
    for (const p of final) {
      const ms = moves.filter((m) => m.item?.sku === p.sku);
      expect(sum(ms.map((m) => m.delta)), `ledger for ${p.sku}`).toBe(p.onHand);
      expect(ms[0].qtyAfter, `latest qtyAfter for ${p.sku}`).toBe(p.onHand);
    }

    // Money: expected figures from first principles
    const revenue = sum(expRecognised.map((o) => o.c.taxable)) - r1Taxable - r2Taxable;
    const cogsGross = sum(expRecognised.map((o) => o.cogs));
    const cogs = cogsGross - cost.hu06 * 1; // only the restockable shirt comes back; the damaged frock stays a cost
    const shipping = sum(expRecognised.map((o) => o.c.ship));
    const confirmedIn = c1.total + 100000 + c3.total + c5.total + c7.total + 10000;
    const cashReceived = confirmedIn - r1Value - r2Value;
    const fin = await get("/api/ministock/finance/summary");
    expect(fin.salesRevenuePaise, "sales revenue (ex tax, ex shipping, net of returns)").toBe(revenue);
    expect(fin.cogsPaise, "cost of goods").toBe(cogs);
    expect(fin.grossProfitPaise, "gross profit").toBe(revenue - cogs);
    expect(fin.shippingChargedPaise).toBe(shipping);
    expect(fin.taxCollectedPaise).toBe(sum(expRecognised.map((o) => o.c.tax)));
    expect(fin.expensesPaise).toBe(512000);
    expect(fin.netProfitPaise, "net profit = gross profit + shipping − expenses").toBe(revenue - cogs + shipping - 512000);
    expect(fin.cashReceivedPaise, "cash received counts confirmed payments less confirmed refunds only").toBe(cashReceived);
    const dues = (c2.total - 100000) + c6.total;
    expect(fin.receivablesPaise).toBe(dues);
    expect(fin.inventoryValuePaise).toBe(47 * cost.hu06 + 9 * 52000 + 7 * 90000 + 23 * 8000);
    expect(fin.payablesPaise, "supplier owes: accepted goods minus the bank payment").toBe(28 * 56000 - 1000000);

    // Customers, dashboard, alerts, reorder
    const cust = (await get("/api/ministock/customers")).customers as any[];
    expect(cust.find((x) => x.name === "Ravi Kumar").outstandingPaise).toBe(c2.total - 100000);
    expect(cust.find((x) => x.name === "Suresh Nayak").outstandingPaise).toBe(c6.total);
    expect(cust.find((x) => x.name === "Meera Das").outstandingPaise).toBe(0);
    const ledger = await get(`/api/ministock/customers/${ravi}/ledger`);
    expect(ledger.totals).toMatchObject({ purchasesPaise: c2.total, paidPaise: 100000, outstandingPaise: c2.total - 100000 });
    const dash = await get("/api/ministock/dashboard");
    expect(dash.today.salesRevenuePaise).toBe(revenue); expect(dash.customerDuesPaise).toBe(dues); expect(dash.lowStockCount, "party frock is at its low-stock level").toBe(1);
    expect(dash.alerts.some((a: any) => /low-stock/.test(a.text))).toBe(true);
    const re = (await get("/api/ministock/reorder")).suggestions as any[];
    const frock = re.find((s) => s.sku === "FR-1Y-PNK");
    expect(frock, "reorder suggestion for the frock").toMatchObject({ available: 7, reorderPoint: 8, suggestedQty: 3 });

    // Reports agree with the summary
    const rep = async (k: string) => get(`/api/ministock/reports/${k}`);
    expect((await rep("sales")).totals.revenue, "gross sales report (before returns)").toBe(sum(expRecognised.map((o) => o.c.taxable)));
    expect((await rep("stock")).totals.value).toBe(fin.inventoryValuePaise);
    expect((await rep("receivables")).totals.owing).toBe(dues);
    expect((await rep("payables")).totals.owing).toBe(28 * 56000 - 1000000);
    expect((await rep("expenses")).totals.total).toBe(512000);
    const prods = (await rep("products")).rows as any[];
    expect(prods.find((r) => r.sku === "SK-PACK").units).toBe(13); // 3 + 10 sold
    expect((await rep("returns")).totals.units).toBe(2);

    // Cash drawer: cash in − cash out (cash refund + cash expense)
    const cashIn = c1.total + restM + c5.total, cashOut = r1Value + 12000;
    const pre = await get(`/api/ministock/finance/cash-close/preview?date=${today()}`);
    expect(pre).toMatchObject({ cashInPaise: cashIn, cashOutPaise: cashOut, expectedPaise: cashIn - cashOut });
    const close = (await post("/api/ministock/finance/cash-close", { date: today(), openingPaise: 0, countedPaise: cashIn - cashOut - 500, note: "₹5 short" })).close;
    expect(close.differencePaise).toBe(-500);

    // Payment records agree with each order's running totals
    for (const o of [O1, O2, O3, O5, O6, O7]) {
      const d = await get(`/api/ministock/orders/${o.id}`);
      const paid = sum(d.payments.filter((p: any) => p.kind === "payment" && p.status === "confirmed").map((p: any) => p.amountPaise));
      const refunded = sum(d.payments.filter((p: any) => p.kind === "refund" && p.status === "confirmed").map((p: any) => p.amountPaise));
      expect([d.order.paidPaise, d.order.refundedPaise], `${d.order.number} totals match its payment records`).toEqual([paid, refunded]);
    }
    void pend;

    // Data rights: export contains the whole business
    const ex = (await get("/api/account/export")).ministock;
    expect([ex.salesOrders.length, ex.customers.length, ex.suppliers.length, ex.purchaseOrders.length, ex.expenses.length, ex.saleReturns.length, ex.stockCounts.length, ex.cashCloses.length]).toEqual([8, 3, 1, 1, 2, 2, 1, 1]);
  });
});

describe("demo business: invoices with GST", () => {
  it("issues invoices with exact tax, tracks part-payment to paid, and flags overdue", async () => {
    const { c } = await signup("Demo Biller");
    await c.put("/api/invoices/business").send(business).expect(200);
    // 3 × ₹1,250 @18% + 2 × ₹800 @5%  →  subtotal ₹5,350, tax ₹675 + ₹80, total ₹6,105
    const lines = [{ description: "Wiring work", quantity: 3, ratePaise: 125000, taxPercent: 18 }, { description: "Switches", quantity: 2, ratePaise: 80000, taxPercent: 5 }];
    const inv = (await c.post("/api/invoices").send({ kind: "invoice", customer: { name: "Anita Sahoo", phone: "9000000001" }, issueDate: "2026-10-01", dueDate: "2026-10-05", lines, discount: { type: "none" }, paidPaise: 0, notes: "", template: "classic", issue: true })).body.item;
    expect([inv.subtotalPaise, inv.taxPaise, inv.totalPaise]).toEqual([535000, 75500, 610500]);
    expect(inv.paymentStatus).toBe("overdue");
    const half = (await c.post(`/api/invoices/${inv.id}/payments`).send({ amountPaise: 300000 })).body.item;
    expect([half.paidPaise, half.paymentStatus]).toEqual([300000, "overdue"]); // part-paid and still late
    expect((await c.post(`/api/invoices/${inv.id}/payments`).send({ amountPaise: 310501 })).status, "cannot overpay").toBe(400);
    const done = (await c.post(`/api/invoices/${inv.id}/payments`).send({ amountPaise: 310500 })).body.item;
    expect([done.paidPaise, done.paymentStatus]).toEqual([610500, "paid"]);
    const dash = (await c.get("/api/account/dashboard")).body;
    expect(dash.money.outstandingPaise).toBe(0); expect(dash.usage.docsTotal).toBe(1);
  });
});
