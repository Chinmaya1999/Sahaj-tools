import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { adminClient, client, signup } from "./helpers.js";
import { sandboxSign, sandboxWebhookSign } from "../src/services/payments/sandbox.js";
import { Entitlement, Order } from "../src/models/index.js";

async function checkout(c: ReturnType<typeof client>, itemId = "inventory-pro", itemType = "plan") {
  const r = await c.post("/api/billing/checkout").send({ itemType, itemId });
  expect(r.status).toBe(201);
  return r.body as { order: { id: string; amountPaise: number }; checkout: { providerOrderId: string } };
}
async function pay(c: ReturnType<typeof client>, orderId: string, providerOrderId: string, paymentId = `pay_${Math.random().toString(16).slice(2)}`) {
  const r = await c.post("/api/billing/verify").send({ orderId, paymentId, signature: sandboxSign(providerOrderId, paymentId) });
  return { r, paymentId };
}
const webhook = (c: ReturnType<typeof client>, body: object, eventId: string, sig?: string) => {
  const raw = JSON.stringify(body);
  return c.post("/api/webhooks/payments").set("content-type", "application/json").set("x-sandbox-event-id", eventId).set("x-sandbox-signature", sig ?? sandboxWebhookSign(raw)).send(raw);
};

describe("payments", () => {
  it("uses the server price, never a browser-supplied one", async () => {
    const { c } = await signup();
    const r = await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "inventory-pro", amountPaise: 1, pricePaise: 1 });
    expect(r.body.order.amountPaise).toBe(9900);
    expect((await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "invoice-free" })).status).toBe(404);
    expect((await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "nope" })).status).toBe(404);
  });
  it("successful payment: order paid + entitlement created, limits raised", async () => {
    const { c } = await signup();
    expect((await c.get("/api/entitlements")).body.access.find((a: any) => a.product === "inventory").limits.maxItems).toBe(25);
    const { order, checkout: ck } = await checkout(c);
    const { r } = await pay(c, order.id, ck.providerOrderId);
    expect(r.body.result).toBe("paid");
    expect(r.body.order.status).toBe("paid");
    expect(r.body.order.receiptNo).toMatch(/^EK-/);
    const acc = (await c.get("/api/entitlements")).body.access.find((a: any) => a.product === "inventory");
    expect(acc.limits.maxItems).toBe(500);
    expect(acc.paid).toBe(true);
  });
  it("rejects forged signatures and does not grant anything", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c);
    const bad = await c.post("/api/billing/verify").send({ orderId: order.id, paymentId: "pay_x1", signature: "deadbeef".repeat(8) });
    expect(bad.status).toBe(400);
    expect((await Order.findById(order.id))!.status).toBe("pending");
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(0);
    void ck;
  });
  it("duplicate verification is idempotent (one entitlement)", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "invoice-starter");
    const pid = "pay_dup123456";
    const rs = await Promise.all([pay(c, order.id, ck.providerOrderId, pid), pay(c, order.id, ck.providerOrderId, pid), pay(c, order.id, ck.providerOrderId, pid)]);
    expect(rs.filter((x) => x.r.body.result === "paid")).toHaveLength(1);
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(1);
    const e = await Entitlement.findOne({ order: order.id });
    expect(e!.creditsRemaining).toBe(10);
  });
  it("another user cannot verify or view someone else's order", async () => {
    const a = await signup(); const b = await signup();
    const { order, checkout: ck } = await checkout(a.c);
    expect((await pay(b.c, order.id, ck.providerOrderId)).r.status).toBe(404);
    expect((await b.c.get(`/api/billing/orders/${order.id}`)).status).toBe(404);
    expect((await b.c.get("/api/billing/orders")).body.orders).toHaveLength(0);
  });
  it("failed and cancelled checkouts never create entitlements; retry works", async () => {
    const { c } = await signup();
    const o1 = await checkout(c);
    await c.post("/api/billing/sandbox/complete").send({ orderId: o1.order.id, outcome: "fail" }).expect(200);
    expect((await c.get(`/api/billing/orders/${o1.order.id}`)).body.order.status).toBe("failed");
    const o2 = await checkout(c);
    await c.post("/api/billing/sandbox/complete").send({ orderId: o2.order.id, outcome: "cancel" }).expect(200);
    expect((await c.get(`/api/billing/orders/${o2.order.id}`)).body.order.status).toBe("cancelled");
    expect(await Entitlement.countDocuments({ order: { $in: [o1.order.id, o2.order.id] } })).toBe(0);
    // a failed order can still be paid (customer retries the same payment screen)
    const ok = await c.post("/api/billing/sandbox/complete").send({ orderId: o1.order.id, outcome: "success" });
    const v = await c.post("/api/billing/verify").send({ orderId: o1.order.id, paymentId: ok.body.paymentId, signature: ok.body.signature });
    expect(v.body.result).toBe("paid");
  });
  it("webhook: rejects invalid signature, accepts valid, ignores duplicate event", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "pdf-batch");
    const anon = client();
    const body = { type: "payment.captured", providerOrderId: ck.providerOrderId, paymentId: "pay_wh0001", amountPaise: order.amountPaise };
    expect((await webhook(anon, body, "evt_1", "00".repeat(32))).status).toBe(400);
    expect((await Order.findById(order.id))!.status).toBe("pending");
    expect((await webhook(anon, body, "evt_1")).body).toEqual({ ok: true });
    expect((await Order.findById(order.id))!.status).toBe("paid");
    expect((await webhook(anon, body, "evt_1")).body.duplicate).toBe(true);
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(1);
  });
  it("webhook with a mismatched amount is not honoured", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "pdf-batch");
    await webhook(client(), { type: "payment.captured", providerOrderId: ck.providerOrderId, paymentId: "pay_mm0001", amountPaise: 100 }, "evt_mm");
    expect((await Order.findById(order.id))!.status).toBe("pending");
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(0);
  });
  it("delayed webhook after browser verification does not double grant", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "photo-batch");
    await pay(c, order.id, ck.providerOrderId, "pay_late0001");
    await webhook(client(), { type: "payment.captured", providerOrderId: ck.providerOrderId, paymentId: "pay_late0001", amountPaise: order.amountPaise }, "evt_late");
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(1);
  });
  it("bundles grant every included plan", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "bundle-student", "bundle");
    expect(order.amountPaise).toBe(9900);
    await pay(c, order.id, ck.providerOrderId);
    expect(await Entitlement.countDocuments({ order: order.id })).toBe(3);
  });
  it("refund revokes access; disputes suspend it", async () => {
    const { c } = await signup();
    const admin = await adminClient();
    const { order, checkout: ck } = await checkout(c, "photo-batch");
    await pay(c, order.id, ck.providerOrderId);
    expect((await c.get("/api/entitlements")).body.access.find((a: any) => a.product === "photo-tools").limits.maxFiles).toBe(50);
    expect((await c.post(`/api/admin/orders/${order.id}/refund`)).status).toBe(403); // customers cannot refund
    await admin.post(`/api/admin/orders/${order.id}/refund`).expect(200);
    expect((await Order.findById(order.id))!.status).toBe("refunded");
    expect((await c.get("/api/entitlements")).body.access.find((a: any) => a.product === "photo-tools").limits.maxFiles).toBe(1);
    // a late "captured" event must not resurrect a refunded order
    await webhook(client(), { type: "payment.captured", providerOrderId: ck.providerOrderId, paymentId: "pay_x_after", amountPaise: order.amountPaise }, "evt_after_refund");
    expect((await Order.findById(order.id))!.status).toBe("refunded");
  });
  it("credit entitlements are spent atomically", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "invitation-pack");
    await pay(c, order.id, ck.providerOrderId);
    const rs = await Promise.all(Array.from({ length: 8 }, () => c.post("/api/entitlements/spend").send({ product: "invitation" })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(5);
    expect(rs.filter((r) => r.status === 402)).toHaveLength(3);
  });
});

describe("downloads", () => {
  it("denies unpaid users, records the attempt", async () => {
    const { c } = await signup();
    expect((await c.post("/api/downloads/inventory-starter-kit/link")).status).toBe(403);
    expect((await c.get("/api/downloads")).body.assets[0].unlocked).toBe(false);
    expect((await c.get("/api/downloads/inventory-starter-kit/file?exp=9999999999&sig=" + "a".repeat(64))).status).toBe(403);
    expect((await c.get("/api/downloads/history")).body.history[0].event).toBe("denied");
  });
  it("paid users get a valid zip with instructions via a signed short-lived link", async () => {
    const { c } = await signup();
    const { order, checkout: ck } = await checkout(c, "inventory-pro");
    await pay(c, order.id, ck.providerOrderId);
    const link = (await c.post("/api/downloads/inventory-starter-kit/link").expect(200)).body;
    expect(link.expiresInSeconds).toBeGreaterThan(0);
    const file = await c.get(link.url).buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on("data", (x: Buffer) => d.push(x)); res.on("end", () => cb(null, Buffer.concat(d))); });
    expect(file.headers["content-type"]).toBe("application/zip");
    const zip = await JSZip.loadAsync(file.body);
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "inventory-clothing.csv", "inventory-cosmetics.csv", "inventory-general.csv"]);
    expect(await zip.file("README.txt")!.async("string")).toContain("How to use");
    // every shipped template must pass our own importer
    const { parseCsv } = await import("@ek/shared");
    for (const name of ["inventory-general.csv", "inventory-cosmetics.csv", "inventory-clothing.csv"]) {
      const [head, ...body] = parseCsv(await zip.file(name)!.async("string"));
      const rows = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
      const prev = (await c.post("/api/inventory/import").send({ rows, commit: false })).body;
      expect(prev.summary.errors, name).toBe(0);
    }
  });
  it("links are bound to the user, expire, and cannot be tampered with", async () => {
    const a = await signup(); const b = await signup();
    const o = await checkout(a.c); await pay(a.c, o.order.id, o.checkout.providerOrderId);
    const o2 = await checkout(b.c); await pay(b.c, o2.order.id, o2.checkout.providerOrderId);
    const link = (await a.c.post("/api/downloads/inventory-starter-kit/link")).body.url as string;
    expect((await b.c.get(link)).status).toBe(403); // someone else's link
    expect((await client().get(link)).status).toBe(401); // no session
    expect((await a.c.get(link.replace(/exp=\d+/, "exp=" + (Math.floor(Date.now() / 1000) + 99999)))).status).toBe(403); // tampered expiry
    expect((await a.c.get(link.replace(/exp=\d+/, "exp=" + (Math.floor(Date.now() / 1000) - 5)))).status).toBe(403); // expired
    expect((await a.c.get(link)).status).toBe(200);
  });
  it("refund revokes an already-issued link", async () => {
    const { c } = await signup(); const admin = await adminClient();
    const o = await checkout(c); await pay(c, o.order.id, o.checkout.providerOrderId);
    const link = (await c.post("/api/downloads/inventory-starter-kit/link")).body.url;
    await admin.post(`/api/admin/orders/${o.order.id}/refund`).expect(200);
    expect((await c.get(link)).status).toBe(403);
  });
});
