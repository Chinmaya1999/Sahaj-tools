import { describe, expect, it } from "vitest";
import { signup } from "./helpers.js";

type C = Awaited<ReturnType<typeof signup>>["c"];
const prod = (o: Record<string, unknown> = {}) => ({ name: "Hu Shirt", ageGroup: "0-6m", colour: "White", productType: "Full sleeve", costPaise: 50000, pricePaise: 79900, openingQty: 20, reorderLevel: 5, sku: "HU-06M-WHI-FSH", ...o });
const mk = async (c: C, o: Record<string, unknown> = {}) => (await c.post("/api/ministock/products").send(prod(o))).body.product;
const sellNow = (c: C, itemId: string, quantity: number, extra: Record<string, unknown> = {}) => c.post("/api/ministock/orders").send({ lines: [{ itemId, quantity }], ...extra });
const item = async (c: C, id: string) => (await c.get(`/api/ministock/products?q=${encodeURIComponent("HU")}`)).body.products.find((p: any) => p.id === id);

describe("MiniStock products and stock", () => {
  it("creates a product with an opening-stock movement and rejects bad input on the server", async () => {
    const { c } = await signup();
    const p = await mk(c);
    expect(p.onHand).toBe(20); expect(p.available).toBe(20);
    const mv = (await c.get("/api/inventory/movements")).body.movements;
    expect(mv).toHaveLength(1); expect(mv[0]).toMatchObject({ type: "stock_in", delta: 20 });
    expect((await c.post("/api/ministock/products").send(prod({ sku: "X1", name: "Other", costPaise: -1 }))).status).toBe(422);
    expect((await c.post("/api/ministock/products").send(prod({ sku: "X2", name: "Other", openingQty: 1.5 }))).status).toBe(422);
    expect((await c.post("/api/ministock/products").send(prod({ sku: "X3", name: "Other", openingQty: -2 }))).status).toBe(422);
  });
  it("rejects duplicate SKUs and duplicate variants, suggests a SKU", async () => {
    const { c } = await signup();
    await mk(c);
    const dupSku = await c.post("/api/ministock/products").send(prod({ name: "Different", colour: "Red" }));
    expect(dupSku.status).toBe(409); expect(dupSku.body.code).toBe("duplicate_sku");
    const dupVar = await c.post("/api/ministock/products").send(prod({ sku: "OTHER-SKU" }));
    expect(dupVar.status).toBe(409); expect(dupVar.body.code).toBe("DUPLICATE_VARIANT");
    expect((await c.get("/api/ministock/products/suggest-sku").query({ name: "Hu", ageGroup: "06M", colour: "White", productType: "Full sleeve shirt" })).body.sku).toBe("HU-06M-WHI-FUL");
  });
  it("adjusts existing stock only with a reason and records before/after", async () => {
    const { c } = await signup(); const p = await mk(c);
    expect((await c.post("/api/ministock/stock/adjust").send({ itemId: p.id, mode: "remove", quantity: 2 })).status).toBe(422);
    const r = await c.post("/api/ministock/stock/adjust").send({ itemId: p.id, mode: "remove", quantity: 3, reason: "damage", note: "water" });
    expect(r.status).toBe(201); expect(r.body.movement).toMatchObject({ before: 20, qtyAfter: 17, delta: -3 });
    expect((await c.post("/api/ministock/stock/adjust").send({ itemId: p.id, mode: "set", quantity: 25, reason: "correction" })).body.product.onHand).toBe(25);
    expect((await c.post("/api/ministock/stock/adjust").send({ itemId: "a".repeat(24), mode: "add", quantity: 1, reason: "found" })).status).toBe(404);
  });
  it("barcode lookup returns details, and an unknown code creates nothing", async () => {
    const { c } = await signup(); const p = await mk(c, { barcode: "8901234" });
    const ok = await c.get("/api/ministock/products/barcode/8901234"); expect(ok.body.product.id).toBe(p.id); expect(ok.body.movements.length).toBe(1);
    const miss = await c.get("/api/ministock/products/barcode/NOPE"); expect(miss.status).toBe(404); expect(miss.body.code).toBe("PRODUCT_NOT_FOUND");
    expect((await c.get("/api/ministock/products")).body.total).toBe(1);
  });
});

describe("MiniStock sales", () => {
  it("recalculates totals on the server, deducts stock and records the cost snapshot", async () => {
    const { c } = await signup(); const p = await mk(c, { taxPercent: 5 });
    const r = await c.post("/api/ministock/orders").send({ lines: [{ itemId: p.id, quantity: 2, discountPaise: 1000 }], discountPaise: 500, shippingPaise: 4000, total: 1, totalPaise: 1 });
    expect(r.status).toBe(201);
    const o = r.body.order;
    const taxable = 2 * 79900 - 1000 - 500;
    expect(o.subtotalPaise).toBe(2 * 79900 - 1000); expect(o.taxPaise).toBe(Math.round(taxable * 0.05)); expect(o.totalPaise).toBe(taxable + Math.round(taxable * 0.05) + 4000);
    expect(o.status).toBe("delivered");
    expect((await item(c, p.id)).onHand).toBe(18);
    const detail = await c.get(`/api/ministock/orders/${o.id}`); expect(detail.body.order.lines[0].taxPercent).toBe(5);
  });
  it("blocks overselling with INSUFFICIENT_STOCK and leaves stock unchanged", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 3 });
    const r = await sellNow(c, p.id, 5);
    expect(r.status).toBe(409); expect(r.body).toMatchObject({ code: "INSUFFICIENT_STOCK", requested: 5, available: 3 });
    expect((await item(c, p.id)).onHand).toBe(3); expect((await c.get("/api/ministock/orders")).body.total).toBe(0);
  });
  it("never oversells under concurrent sales of the last units", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 5 });
    const rs = await Promise.all(Array.from({ length: 8 }, () => sellNow(c, p.id, 1)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(5); expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await item(c, p.id)).onHand).toBe(0);
  });
  it("is idempotent: a retried request with the same key returns the same order and deducts once", async () => {
    const { c } = await signup(); const p = await mk(c);
    const a = await c.post("/api/ministock/orders").set("Idempotency-Key", "k-1").send({ lines: [{ itemId: p.id, quantity: 4 }] });
    const b = await c.post("/api/ministock/orders").set("Idempotency-Key", "k-1").send({ lines: [{ itemId: p.id, quantity: 4 }] });
    expect(a.status).toBe(201); expect(b.status).toBe(200); expect(b.body.replayed).toBe(true); expect(b.body.order.id).toBe(a.body.order.id);
    expect((await item(c, p.id)).onHand).toBe(16);
    const par = await Promise.all([1, 2, 3].map(() => c.post("/api/ministock/orders").set("Idempotency-Key", "k-2").send({ lines: [{ itemId: p.id, quantity: 1 }] })));
    expect(new Set(par.map((r) => r.body.order.id)).size).toBe(1); expect((await item(c, p.id)).onHand).toBe(15);
  });
  it("handles partial payments, outstanding balance, overpayment and pending payments", async () => {
    const { c } = await signup(); const p = await mk(c, { pricePaise: 100000 });
    const o = (await sellNow(c, p.id, 2, { payments: [{ method: "cash", amountPaise: 120000 }] })).body.order;
    expect(o.totalPaise).toBe(200000); expect(o.paidPaise).toBe(120000); expect(o.outstandingPaise).toBe(80000);
    const over = await c.post(`/api/ministock/orders/${o.id}/payments`).send({ method: "upi", amountPaise: 90000, reference: "U1" });
    expect(over.status).toBe(409); expect(over.body.code).toBe("OVERPAYMENT");
    const pend = await c.post(`/api/ministock/orders/${o.id}/payments`).send({ method: "upi", amountPaise: 80000, reference: "U2", status: "pending" });
    expect(pend.body.order.paidPaise).toBe(120000); expect(pend.body.order.outstandingPaise).toBe(80000);
    const id = pend.body.payment.id;
    expect((await c.post(`/api/ministock/payments/${id}/confirm`)).status).toBe(200);
    expect((await c.post(`/api/ministock/payments/${id}/confirm`)).status).toBe(200);
    const after = (await c.get(`/api/ministock/orders/${o.id}`)).body.order; expect(after.paidPaise).toBe(200000); expect(after.outstandingPaise).toBe(0);
    expect((await c.post(`/api/ministock/orders/${o.id}/payments`).send({ method: "upi", amountPaise: 1000, reference: "U2" })).status).toBe(409);
  });
  it("reserves stock for online orders and deducts exactly once at dispatch", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 10 });
    const o = (await sellNow(c, p.id, 4, { fulfilment: "later", channel: "whatsapp" })).body.order;
    expect(o.status).toBe("confirmed"); let it = await item(c, p.id); expect(it).toMatchObject({ onHand: 10, reserved: 4, available: 6 });
    expect((await sellNow(c, p.id, 7)).status).toBe(409);
    expect((await c.post(`/api/ministock/orders/${o.id}/ship`)).status).toBe(409);
    expect((await c.post(`/api/ministock/orders/${o.id}/pack`).send({ scans: ["HU-06M-WHI-FSH", "HU-06M-WHI-FSH"] })).body.code).toBe("PACK_MISMATCH");
    expect((await c.post(`/api/ministock/orders/${o.id}/pack`).send({ scans: Array(4).fill("HU-06M-WHI-FSH") })).status).toBe(200);
    const ships = await Promise.all([1, 2].map(() => c.post(`/api/ministock/orders/${o.id}/ship`).send({ courier: "DTDC", tracking: "T1" })));
    expect(ships.map((r) => r.status).sort()).toEqual([200, 409]);
    it = await item(c, p.id); expect(it).toMatchObject({ onHand: 6, reserved: 0 });
    expect((await c.post(`/api/ministock/orders/${o.id}/deliver`)).body.order.status).toBe("delivered");
    expect((await c.post(`/api/ministock/orders/${o.id}/pack`)).status).toBe(409);
  });
  it("cancels exactly once: releases reservations and queues a refund for money received", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 10 });
    const o = (await sellNow(c, p.id, 3, { fulfilment: "later", payments: [{ method: "upi", amountPaise: 50000, reference: "A1" }] })).body.order;
    const r1 = await c.post(`/api/ministock/orders/${o.id}/cancel`).send({ reason: "customer asked" }); expect(r1.status).toBe(200);
    expect((await c.post(`/api/ministock/orders/${o.id}/cancel`).send({ reason: "again" })).status).toBe(409);
    expect(await item(c, p.id)).toMatchObject({ onHand: 10, reserved: 0 });
    const refunds = (await c.get("/api/ministock/payments?kind=refund")).body.payments; expect(refunds).toHaveLength(1); expect(refunds[0]).toMatchObject({ status: "pending", amountPaise: 50000 });
    const done = await sellNow(c, p.id, 2); expect((await c.post(`/api/ministock/orders/${done.body.order.id}/cancel`).send({ reason: "void" })).status).toBe(200);
    expect(await item(c, p.id)).toMatchObject({ onHand: 10 });
    const mv = (await c.get("/api/inventory/movements?limit=50")).body.movements.map((m: any) => m.type); expect(mv).toContain("sale_reversal");
  });
});

describe("MiniStock returns", () => {
  it("restocks only restockable items, treats refund and restock separately, caps quantities", async () => {
    const { c } = await signup(); const p = await mk(c, { pricePaise: 100000, openingQty: 10 });
    const o = (await sellNow(c, p.id, 4, { payments: [{ method: "cash", amountPaise: 400000 }] })).body.order;
    const bad = await c.post("/api/ministock/returns").send({ orderId: o.id, lines: [{ itemId: p.id, quantity: 5, reason: "defective", condition: "restockable" }] });
    expect(bad.status).toBe(409);
    const r = await c.post("/api/ministock/returns").send({ orderId: o.id, refund: { method: "cash" }, lines: [{ itemId: p.id, quantity: 2, reason: "defective", condition: "pending" }] });
    expect(r.status).toBe(201); expect((await item(c, p.id)).onHand).toBe(6); // refund did not restock
    const detail = (await c.get(`/api/ministock/orders/${o.id}`)).body;
    expect(detail.order).toMatchObject({ status: "partially_returned", refundedPaise: 200000, returnedValuePaise: 200000, outstandingPaise: 0 });
    const ins = await c.post(`/api/ministock/returns/${r.body.return.id}/inspect`).send({ decisions: [{ index: 0, condition: "restockable" }] }); expect(ins.status).toBe(200);
    expect((await item(c, p.id)).onHand).toBe(8);
    expect((await c.post(`/api/ministock/returns/${r.body.return.id}/inspect`).send({ decisions: [{ index: 0, condition: "damaged" }] })).status).toBe(409);
    const r2 = await c.post("/api/ministock/returns").send({ orderId: o.id, lines: [{ itemId: p.id, quantity: 2, reason: "changed_mind", condition: "damaged" }], refund: { method: "cash" } });
    expect(r2.status).toBe(201); expect((await item(c, p.id)).onHand).toBe(8);
    expect((await c.get(`/api/ministock/orders/${o.id}`)).body.order.status).toBe("returned");
    expect((await c.post(`/api/ministock/orders/${o.id}/cancel`).send({ reason: "x" })).status).toBe(409);
  });
  it("a return on a part-paid sale refunds only the overpayment and clears the balance", async () => {
    const { c } = await signup(); const p = await mk(c, { pricePaise: 100000 });
    const o = (await sellNow(c, p.id, 2, { payments: [{ method: "cash", amountPaise: 120000 }] })).body.order;
    const r = await c.post("/api/ministock/returns").send({ orderId: o.id, refund: { method: "cash" }, lines: [{ itemId: p.id, quantity: 1, reason: "wrong_item", condition: "restockable" }] });
    expect(r.status).toBe(201);
    expect((await c.get(`/api/ministock/orders/${o.id}`)).body.order).toMatchObject({ refundedPaise: 20000, returnedValuePaise: 100000, outstandingPaise: 0 });
  });
});

describe("MiniStock purchasing", () => {
  it("receives partial deliveries, rejects double receipts, and only accepted goods enter stock", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 0 });
    const sup = (await c.post("/api/ministock/suppliers").send({ name: "Fab Co", leadTimeDays: 5, paymentTermsDays: 15 })).body.supplier;
    const po = (await c.post("/api/ministock/purchase-orders").send({ supplierId: sup._id, lines: [{ itemId: p.id, quantity: 100, unitCostPaise: 45000 }] })).body.purchaseOrder;
    expect((await item(c, p.id)).onHand).toBe(0);
    const r1 = await c.post(`/api/ministock/purchase-orders/${po.id}/receive`).send({ key: "delivery-0001", lines: [{ itemId: p.id, accepted: 75, rejected: 5 }] });
    expect(r1.status).toBe(201); expect(r1.body.purchaseOrder).toMatchObject({ status: "partially_received", receivedValuePaise: 75 * 45000 });
    expect((await item(c, p.id)).onHand).toBe(75);
    const replay = await c.post(`/api/ministock/purchase-orders/${po.id}/receive`).send({ key: "delivery-0001", lines: [{ itemId: p.id, accepted: 75, rejected: 5 }] });
    expect(replay.status).toBe(200); expect(replay.body.replayed).toBe(true); expect((await item(c, p.id)).onHand).toBe(75);
    expect((await c.post(`/api/ministock/purchase-orders/${po.id}/receive`).send({ key: "delivery-0002", lines: [{ itemId: p.id, accepted: 30, rejected: 0 }] })).body.code).toBe("OVER_RECEIPT");
    const r2 = await c.post(`/api/ministock/purchase-orders/${po.id}/receive`).send({ key: "delivery-0003", lines: [{ itemId: p.id, accepted: 20, rejected: 0 }] });
    expect(r2.body.purchaseOrder.status).toBe("received"); expect((await item(c, p.id)).onHand).toBe(95);
    const pay = await c.post(`/api/ministock/purchase-orders/${po.id}/payments`).send({ amountPaise: 1000000, method: "bank" }); expect(pay.body.purchaseOrder.balancePaise).toBe(95 * 45000 - 1000000);
    expect((await c.post(`/api/ministock/purchase-orders/${po.id}/payments`).send({ amountPaise: 99999999, method: "bank" })).body.code).toBe("OVERPAYMENT");
    expect((await c.get("/api/ministock/suppliers")).body.suppliers[0].balancePaise).toBe(95 * 45000 - 1000000);
  });
  it("suggests reorders from demand, lead time and safety stock, counting stock already on order", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 40, reorderLevel: 8, supplier: "Fab Co" });
    await c.post("/api/ministock/suppliers").send({ name: "Fab Co", leadTimeDays: 5 });
    await sellNow(c, p.id, 30); // 30 units in 30 days = 1/day
    const s = (await c.get("/api/ministock/reorder")).body.suggestions;
    // available 10, reorder point 1*5+8 = 13 → needed; target 13 + 14 = 27 → 17
    expect(s[0]).toMatchObject({ available: 10, reorderPoint: 13, suggestedQty: 17, leadTimeDays: 5 });
    const sup = (await c.get("/api/ministock/suppliers")).body.suppliers[0];
    await c.post("/api/ministock/purchase-orders").send({ supplierId: sup.id, lines: [{ itemId: p.id, quantity: 20, unitCostPaise: 50000 }] });
    expect((await c.get("/api/ministock/reorder")).body.suggestions).toHaveLength(0);
  });
});

describe("MiniStock finance", () => {
  it("separates revenue, cash, receivables, profit and inventory value", async () => {
    const { c } = await signup(); const p = await mk(c, { costPaise: 50000, pricePaise: 79900, openingQty: 10 });
    await sellNow(c, p.id, 2, { payments: [{ method: "cash", amountPaise: 100000 }], shippingPaise: 6000 });
    await c.post("/api/ministock/expenses").send({ category: "Packaging", amountPaise: 20000, date: new Date().toISOString(), account: "cash" });
    const f = (await c.get("/api/ministock/finance/summary")).body;
    expect(f.salesRevenuePaise).toBe(2 * 79900); expect(f.cogsPaise).toBe(2 * 50000); expect(f.grossProfitPaise).toBe(2 * 79900 - 2 * 50000);
    expect(f.shippingChargedPaise).toBe(6000); expect(f.expensesPaise).toBe(20000); expect(f.netProfitPaise).toBe(f.grossProfitPaise + 6000 - 20000);
    expect(f.cashReceivedPaise).toBe(100000); expect(f.receivablesPaise).toBe(2 * 79900 + 6000 - 100000); expect(f.inventoryValuePaise).toBe(8 * 50000);
    expect(f.definitions.grossProfit).toContain("before");
  });
  it("returns reduce revenue and restocked cost; unpaid cash payments are excluded; cash close reconciles", async () => {
    const { c } = await signup(); const p = await mk(c, { costPaise: 50000, pricePaise: 100000 });
    const o = (await sellNow(c, p.id, 2, { payments: [{ method: "cash", amountPaise: 200000 }] })).body.order;
    await c.post("/api/ministock/returns").send({ orderId: o.id, refund: { method: "cash" }, lines: [{ itemId: p.id, quantity: 1, reason: "other", condition: "restockable" }] });
    const f = (await c.get("/api/ministock/finance/summary")).body;
    expect(f.salesRevenuePaise).toBe(100000); expect(f.cogsPaise).toBe(50000); expect(f.cashReceivedPaise).toBe(100000);
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const pre = (await c.get(`/api/ministock/finance/cash-close/preview?date=${today}`)).body; expect(pre).toMatchObject({ cashInPaise: 200000, cashOutPaise: 100000, expectedPaise: 100000 });
    const close = await c.post("/api/ministock/finance/cash-close").send({ date: today, openingPaise: 0, countedPaise: 99000, note: "short" });
    expect(close.status).toBe(201); expect(close.body.close.differencePaise).toBe(-1000);
    expect((await c.post("/api/ministock/finance/cash-close").send({ date: today, openingPaise: 0, countedPaise: 1 })).status).toBe(409);
  });
  it("dashboard, reports and CSV export work", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 3, reorderLevel: 5 });
    await sellNow(c, p.id, 1);
    const d = (await c.get("/api/ministock/dashboard")).body; expect(d.today.orders).toBe(1); expect(d.lowStockCount).toBe(1); expect(d.alerts.length).toBeGreaterThan(0);
    for (const k of ["sales", "products", "stock", "receivables", "payables", "expenses", "returns", "movements"]) expect((await c.get(`/api/ministock/reports/${k}`)).status).toBe(200);
    const csv = await c.get("/api/ministock/reports/stock?format=csv"); expect(csv.headers["content-type"]).toContain("text/csv"); expect(csv.text).toContain("HU-06M-WHI-FSH");
    expect((await c.get("/api/ministock/reports/nope")).status).toBe(409);
  });
  it("posts a stock count only after confirmation, recording each variance", async () => {
    const { c } = await signup(); const p = await mk(c, { openingQty: 10 });
    const cnt = (await c.post("/api/ministock/stock-counts").send({ lines: [{ itemId: p.id, counted: 7 }] })).body.count;
    expect(cnt.lines[0].variance).toBe(-3); expect((await item(c, p.id)).onHand).toBe(10);
    expect((await c.post(`/api/ministock/stock-counts/${cnt._id}/post`).send({})).status).toBe(422);
    expect((await c.post(`/api/ministock/stock-counts/${cnt._id}/post`).send({ confirm: true })).status).toBe(200);
    expect((await c.post(`/api/ministock/stock-counts/${cnt._id}/post`).send({ confirm: true })).status).toBe(409);
    expect((await item(c, p.id)).onHand).toBe(7);
    expect((await c.get("/api/inventory/movements")).body.movements[0]).toMatchObject({ type: "stocktake", delta: -3 });
  });
});

describe("MiniStock isolation and auth", () => {
  it("keeps each business's data private and requires sign-in", async () => {
    const a = await signup(); const b = await signup();
    const p = await mk(a.c); const o = (await sellNow(a.c, p.id, 1)).body.order;
    expect((await b.c.get(`/api/ministock/orders/${o.id}`)).status).toBe(404);
    expect((await sellNow(b.c, p.id, 1)).status).toBe(404);
    expect((await b.c.post("/api/ministock/stock/adjust").send({ itemId: p.id, mode: "add", quantity: 1, reason: "correction" })).status).toBe(404);
    expect((await b.c.get("/api/ministock/products")).body.total).toBe(0);
    const { client } = await import("./helpers.js"); expect((await client().get("/api/ministock/dashboard")).status).toBe(401);
  });
  it("keeps historical prices when the product price changes", async () => {
    const { c } = await signup(); const p = await mk(c);
    const o = (await sellNow(c, p.id, 1)).body.order;
    await c.patch(`/api/ministock/products/${p.id}`).send({ pricePaise: 99900 });
    expect((await c.get(`/api/ministock/orders/${o.id}`)).body.order.lines[0].unitPricePaise).toBe(79900);
    expect((await sellNow(c, p.id, 1)).body.order.lines[0].unitPricePaise).toBe(99900);
  });
});

describe("MiniStock and account data rights", () => {
  it("exports all MiniStock records and deletes every one of them with the account", async () => {
    const { c, id } = await signup();
    const p = await mk(c); await sellNow(c, p.id, 2, { payments: [{ method: "cash", amountPaise: 50000 }] });
    await c.post("/api/ministock/customers").send({ name: "Ravi" }); await c.post("/api/ministock/suppliers").send({ name: "Fab Co" });
    await c.post("/api/ministock/expenses").send({ category: "Rent", amountPaise: 1000, date: new Date().toISOString() });
    const ex = (await c.get("/api/account/export")).body.ministock;
    expect(ex.salesOrders).toHaveLength(1); expect(ex.salePayments).toHaveLength(1); expect(ex.customers).toHaveLength(1); expect(ex.suppliers).toHaveLength(1); expect(ex.expenses).toHaveLength(1);
    const { PASSWORD } = await import("./helpers.js");
    expect((await c.delete("/api/account").send({ password: PASSWORD, confirm: "DELETE" })).status).toBe(200);
    const M: any = await import("../src/models/index.js");
    for (const name of ["Customer", "Supplier", "SaleOrder", "SalePayment", "SaleReturn", "PurchaseOrder", "Expense", "StockCount", "CashClose", "InventoryItem", "StockMovement"]) expect(await M[name].countDocuments({ owner: id }), name).toBe(0);
  });
});
