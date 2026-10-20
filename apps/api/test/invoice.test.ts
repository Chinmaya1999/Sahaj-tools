import { describe, expect, it } from "vitest";
import { business, invoiceBody, signup, adminClient } from "./helpers.js";

async function setup() {
  const u = await signup();
  await u.c.put("/api/invoices/business").send(business).expect(200);
  return u;
}

describe("invoices", () => {
  it("requires a business profile", async () => {
    const { c } = await signup();
    const r = await c.post("/api/invoices").send(invoiceBody());
    expect(r.status).toBe(412);
  });
  it("recalculates totals on the server, ignoring client numbers", async () => {
    const { c } = await setup();
    const r = await c.post("/api/invoices").send({ ...invoiceBody(), totalPaise: 1, subtotalPaise: 1 });
    expect(r.status).toBe(201);
    expect(r.body.item.subtotalPaise).toBe(112345);
    expect(r.body.item.taxPaise).toBe(18617);
    expect(r.body.item.totalPaise).toBe(130962);
    expect(r.body.item.number).toBe("INV-0001");
    expect(r.body.item.paymentStatus).toBe("overdue"); // due date long past, nothing paid
  });
  it("applies discounts and rounds half-up", async () => {
    const { c } = await setup();
    const r = await c.post("/api/invoices").send(invoiceBody({ lines: [{ description: "x", quantity: 3, ratePaise: 3333, taxPercent: 18 }], discount: { type: "percent", value: 10 }, dueDate: null }));
    expect(r.body.item.discountPaise).toBe(1000);
    expect(r.body.item.totalPaise).toBe(10619);
  });
  it("rejects invalid quantities, rates, tax and overpayment", async () => {
    const { c } = await setup();
    const line = { description: "x", quantity: 1, ratePaise: 100, taxPercent: 0 };
    for (const bad of [{ ...line, quantity: 0 }, { ...line, quantity: -2 }, { ...line, ratePaise: -1 }, { ...line, ratePaise: 10.5 }, { ...line, taxPercent: 150 }, { ...line, quantity: 1.0001 }]) {
      expect((await c.post("/api/invoices").send(invoiceBody({ lines: [bad] }))).status).toBe(422);
    }
    expect((await c.post("/api/invoices").send(invoiceBody({ lines: [line], paidPaise: 500 }))).status).toBe(400);
    expect((await c.post("/api/invoices").send(invoiceBody({ lines: [] }))).status).toBe(422);
  });
  it("numbers sequentially without duplicates under concurrency (Pro plan)", async () => {
    const { c, id } = await setup();
    const admin = await adminClient();
    const email = (await c.get("/api/auth/me")).body.user.email;
    await admin.post("/api/admin/entitlements/grant").send({ email, planId: "invoice-pro" }).expect(201);
    const results = await Promise.all(Array.from({ length: 8 }, () => c.post("/api/invoices").send(invoiceBody({ dueDate: null }))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.item.number);
    expect(new Set(numbers).size).toBe(8);
    void id;
  });
  it("enforces the free monthly limit, then credits", async () => {
    const { c } = await setup();
    await c.post("/api/invoices").send(invoiceBody({ dueDate: null })).expect(201);
    await c.post("/api/invoices").send(invoiceBody({ dueDate: null })).expect(201);
    const third = await c.post("/api/invoices").send(invoiceBody({ dueDate: null }));
    expect(third.status).toBe(402);
    expect(third.body.code).toBe("upgrade_required");
  });
  it("edits create a revision; paid status is computed and never overstated", async () => {
    const { c } = await setup();
    const created = (await c.post("/api/invoices").send(invoiceBody({ dueDate: null }))).body.item;
    expect(created.paymentStatus).toBe("unpaid");
    const upd = await c.put(`/api/invoices/${created.id}`).send(invoiceBody({ dueDate: null, lines: [{ description: "y", quantity: 1, ratePaise: 10000, taxPercent: 0 }], paidPaise: 4000 }));
    expect(upd.body.item.revision).toBe(2);
    expect(upd.body.item.paymentStatus).toBe("partial");
    expect(upd.body.item.number).toBe(created.number);
    const detail = await c.get(`/api/invoices/${created.id}`);
    expect(detail.body.item.history).toHaveLength(1);
    expect((await c.post(`/api/invoices/${created.id}/payments`).send({ amountPaise: 6001 })).status).toBe(400);
    const paid = await c.post(`/api/invoices/${created.id}/payments`).send({ amountPaise: 6000 });
    expect(paid.body.item.paymentStatus).toBe("paid");
  });
  it("quotation -> accept -> convert exactly once", async () => {
    const { c } = await setup();
    const pro = await adminClient();
    await pro.post("/api/admin/entitlements/grant").send({ email: (await c.get("/api/auth/me")).body.user.email, planId: "invoice-pro" });
    const q = (await c.post("/api/invoices").send(invoiceBody({ kind: "quotation", dueDate: null }))).body.item;
    expect(q.number).toBe("QT-0001");
    expect((await c.post(`/api/invoices/${q.id}/convert`)).status).toBe(409); // not accepted yet
    await c.post(`/api/invoices/${q.id}/accept`).expect(200);
    const [a, b] = await Promise.all([c.post(`/api/invoices/${q.id}/convert`), c.post(`/api/invoices/${q.id}/convert`)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const inv = [a, b].find((r) => r.status === 201)!.body.item;
    expect(inv.kind).toBe("invoice");
    expect(inv.totalPaise).toBe(q.totalPaise);
    expect(inv.convertedFrom).toBe(q.id);
  });
  it("only drafts can be deleted; issued documents are voided", async () => {
    const { c } = await setup();
    const issued = (await c.post("/api/invoices").send(invoiceBody({ dueDate: null }))).body.item;
    expect((await c.delete(`/api/invoices/${issued.id}`)).status).toBe(409);
    expect((await c.post(`/api/invoices/${issued.id}/void`)).body.item.status).toBe("void");
    const draft = (await c.post("/api/invoices").send(invoiceBody({ dueDate: null, issue: false }))).body.item;
    expect(draft.status).toBe("draft");
    expect((await c.delete(`/api/invoices/${draft.id}`)).status).toBe(200);
  });
  it("isolates documents between users", async () => {
    const a = await setup(); const b = await setup();
    const doc = (await a.c.post("/api/invoices").send(invoiceBody({ dueDate: null }))).body.item;
    expect((await b.c.get(`/api/invoices/${doc.id}`)).status).toBe(404);
    expect((await b.c.put(`/api/invoices/${doc.id}`).send(invoiceBody())).status).toBe(404);
    expect((await b.c.post(`/api/invoices/${doc.id}/payments`).send({ amountPaise: 100 })).status).toBe(404);
    expect((await b.c.get("/api/invoices")).body.items).toHaveLength(0);
  });
  it("exports CSV with formula-injection protection", async () => {
    const { c } = await setup();
    await c.post("/api/invoices").send(invoiceBody({ dueDate: null, customer: { name: "=cmd|' /C calc'!A0" } })).expect(201);
    const r = await c.get("/api/invoices/export.csv");
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.text).toContain("INV-0001");
    expect(r.text).not.toMatch(/,=cmd/);
  });
  it("rejects a logo that is not a real image", async () => {
    const { c } = await signup();
    const fake = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
    expect((await c.put("/api/invoices/business").send({ ...business, logoDataUrl: fake })).status).toBe(400);
  });
});
