import { describe, expect, it } from "vitest";
import { adminClient, business, client, invoiceBody, signup, PASSWORD } from "./helpers.js";
import { sandboxSign } from "../src/services/payments/sandbox.js";
import { Order, PromoCode } from "../src/models/index.js";

async function pay(c: ReturnType<typeof client>, itemId: string, code?: string) {
  const r = await c.post("/api/billing/checkout").send({ itemType: "plan", itemId, code });
  if (r.status !== 201) return r;
  const pid = `pay_${Math.random().toString(16).slice(2)}`;
  await c.post("/api/billing/verify").send({ orderId: r.body.order.id, paymentId: pid, signature: sandboxSign(r.body.checkout.providerOrderId, pid) }).expect(200);
  return r;
}

describe("promo codes", () => {
  it("admin creates a code; server applies it to the price; usage is counted once paid", async () => {
    const admin = await adminClient(); const { c } = await signup();
    await admin.post("/api/admin/promos").send({ code: "welcome20", percentOff: 20, maxUses: 2 }).expect(201);
    expect((await admin.post("/api/admin/promos").send({ code: "WELCOME20", percentOff: 10 })).status).toBe(400); // duplicate
    const prev = await c.post("/api/billing/promo").send({ itemType: "plan", itemId: "invoice-pro", code: "welcome20" });
    expect(prev.body).toMatchObject({ listPricePaise: 9900, discountPaise: 1980, finalPaise: 7920 });
    const r = await pay(c, "invoice-pro", "WELCOME20");
    expect(r.body.order.amountPaise).toBe(7920);
    expect((await PromoCode.findOne({ code: "WELCOME20" }))!.uses).toBe(1);
    // a browser can't invent a discount
    expect((await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "invoice-pro", code: "NOPE" })).status).toBe(400);
    const o = await Order.findById(r.body.order.id); expect(o!.discountPaise).toBe(1980);
  });
  it("respects max uses, expiry and deactivation; customers cannot create codes", async () => {
    const admin = await adminClient(); const { c } = await signup();
    expect((await c.post("/api/admin/promos").send({ code: "HACK", percentOff: 90 })).status).toBe(403);
    const p = (await admin.post("/api/admin/promos").send({ code: "ONCE", percentOff: 50, maxUses: 1 })).body.promo;
    await pay(c, "photo-batch", "ONCE");
    const other = await signup();
    expect((await other.c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "photo-batch", code: "ONCE" })).body.error).toMatch(/fully used/);
    await admin.post("/api/admin/promos").send({ code: "OLD", percentOff: 10, expiresAt: "2020-01-01" });
    expect((await other.c.post("/api/billing/promo").send({ itemType: "plan", itemId: "photo-batch", code: "OLD" })).body.error).toMatch(/expired/);
    await admin.post("/api/admin/promos").send({ code: "OFFSOON", percentOff: 10 });
    const id = (await admin.get("/api/admin/promos")).body.promos.find((x: any) => x.code === "OFFSOON")._id;
    await admin.patch(`/api/admin/promos/${id}`).send({ active: false }).expect(200);
    expect((await other.c.post("/api/billing/promo").send({ itemType: "plan", itemId: "photo-batch", code: "OFFSOON" })).status).toBe(400);
    void p;
  });
  it("the price never drops below ₹1", async () => {
    const admin = await adminClient(); const { c } = await signup();
    await admin.post("/api/admin/promos").send({ code: "BIG90", percentOff: 90 }).expect(201);
    const r = await c.post("/api/billing/promo").send({ itemType: "plan", itemId: "invoice-starter", code: "BIG90" });
    expect(r.body.finalPaise).toBeGreaterThanOrEqual(100);
  });
});

describe("premium invoice features", () => {
  it("modern/minimal templates are locked until a paid plan; summary shows money owed", async () => {
    const { c } = await signup(); await c.put("/api/invoices/business").send(business).expect(200);
    const locked = await c.post("/api/invoices").send(invoiceBody({ template: "modern", dueDate: null }));
    expect(locked.status).toBe(402);
    await pay(c, "invoice-starter");
    expect((await c.post("/api/invoices").send(invoiceBody({ template: "modern", dueDate: "2020-01-01" }))).status).toBe(201);
    const s = (await c.get("/api/invoices/summary")).body;
    expect(s.outstandingPaise).toBe(130962); expect(s.overdueCount).toBe(1); expect(s.late[0].number).toBe("INV-0001");
    expect((await c.get("/api/entitlements")).body.access.find((a: any) => a.product === "invoice").limits.removeBranding).toBe(false);
  });
});

describe("inventory reports (paid)", () => {
  it("free is locked; paid shows top sellers, dead stock and estimated profit", async () => {
    const { c } = await signup();
    const mk = async (sku: string, price: number, cost: number, qty: number) => (await c.post("/api/inventory/items").send({ name: sku, sku, pricePaise: price, costPaise: cost, reorderLevel: 0, openingQty: qty })).body.item;
    const a = await mk("A", 10000, 6000, 10); await mk("B", 5000, 3000, 4);
    await c.post(`/api/inventory/items/${a.id}/movements`).send({ type: "sale", quantity: 3 }).expect(201);
    expect((await c.get("/api/inventory/reports")).status).toBe(402);
    await pay(c, "inventory-pro");
    const r = (await c.get("/api/inventory/reports?days=30")).body;
    expect(r.totals).toEqual({ units: 3, revenuePaise: 30000, profitPaise: 12000 });
    expect(r.top[0].sku).toBe("A"); expect(r.dead.map((x: any) => x.sku)).toEqual(["B"]);
  });
});

describe("admin user management", () => {
  it("suspending a user blocks login and kills sessions; admins are protected", async () => {
    const admin = await adminClient(); const { c, email, id } = await signup();
    const detail = (await admin.get(`/api/admin/users/${id}`)).body; expect(detail.user.email).toBe(email);
    await admin.post(`/api/admin/users/${id}/disable`).expect(200);
    expect((await c.get("/api/auth/me")).body.user).toBeNull();
    const l = await client().post("/api/auth/login").send({ email, password: PASSWORD });
    expect(l.status).toBe(403); expect(l.body.code).toBe("suspended");
    await admin.post(`/api/admin/users/${id}/enable`).expect(200);
    expect((await client().post("/api/auth/login").send({ email, password: PASSWORD })).status).toBe(200);
    const me = (await admin.get("/api/auth/me")).body.user;
    expect((await admin.post(`/api/admin/users/${me.id}/disable`)).status).toBe(400);
    expect((await (await signup()).c.get(`/api/admin/users/${id}`)).status).toBe(403);
  });
  it("revenue series covers every day", async () => {
    const admin = await adminClient(); const { c } = await signup();
    await pay(c, "pdf-batch");
    const r = (await admin.get("/api/admin/revenue?days=14")).body;
    expect(r.series).toHaveLength(14); expect(r.series.at(-1).paise).toBeGreaterThanOrEqual(2900);
  });
});

describe("dashboards", () => {
  it("customer dashboard reports usage, overdue money and low stock, scoped to the user", async () => {
    const a = await signup(); const b = await signup();
    await a.c.put("/api/invoices/business").send(business).expect(200);
    await a.c.post("/api/invoices").send(invoiceBody({ dueDate: "2020-01-01" })).expect(201);
    await a.c.post("/api/inventory/items").send({ name: "Soap", sku: "S1", pricePaise: 1000, costPaise: 500, reorderLevel: 5, openingQty: 2 }).expect(201);
    const d = (await a.c.get("/api/account/dashboard")).body;
    expect(d.usage).toMatchObject({ docsMonth: 1, items: 1 });
    expect(d.money).toMatchObject({ overdueCount: 1, outstandingPaise: 130962 });
    expect(d.stock).toMatchObject({ low: 1, lowNames: ["Soap"] });
    expect(d.access).toHaveLength(7);
    const other = (await b.c.get("/api/account/dashboard")).body;
    expect(other.usage.docsMonth).toBe(0); expect(other.money.overdueCount).toBe(0);
    expect((await client().get("/api/account/dashboard")).status).toBe(401);
  });
  it("admin dashboard aggregates revenue trend, statuses and attention items; customers are refused", async () => {
    const admin = await adminClient(); const { c } = await signup();
    await pay(c, "photo-batch");
    const d = (await admin.get("/api/admin/dashboard")).body;
    expect(d.revenue.paise).toBeGreaterThanOrEqual(2900); expect(d.signupSeries).toHaveLength(30);
    expect(d.statuses.paid).toBeGreaterThanOrEqual(1); expect(d.recentOrders.length).toBeGreaterThan(0);
    expect(d.attention).toHaveProperty("openSupport");
    expect((await c.get("/api/admin/dashboard")).status).toBe(403);
  });
});
