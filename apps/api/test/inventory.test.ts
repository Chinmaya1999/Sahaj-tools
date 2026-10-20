import { describe, expect, it } from "vitest";
import { signup } from "./helpers.js";

const item = (o: Record<string, unknown> = {}) => ({ name: "Face Wash", sku: "FW-1", pricePaise: 18000, costPaise: 11000, reorderLevel: 5, openingQty: 10, ...o });

describe("inventory", () => {
  it("creates items with an opening movement and tracks every change", async () => {
    const { c } = await signup();
    const it1 = (await c.post("/api/inventory/items").send(item())).body.item;
    expect(it1.quantity).toBe(10);
    await c.post(`/api/inventory/items/${it1.id}/movements`).send({ type: "sale", quantity: 3 }).expect(201);
    await c.post(`/api/inventory/items/${it1.id}/movements`).send({ type: "return", quantity: 1 }).expect(201);
    await c.post(`/api/inventory/items/${it1.id}/movements`).send({ type: "damage", quantity: 2 }).expect(201);
    const after = (await c.post(`/api/inventory/items/${it1.id}/movements`).send({ type: "adjustment", direction: "increase", quantity: 4 })).body.item;
    expect(after.quantity).toBe(10 - 3 + 1 - 2 + 4);
    const mv = (await c.get("/api/inventory/movements")).body.movements;
    expect(mv.map((m: any) => m.type).reverse()).toEqual(["opening", "sale", "return", "damage", "adjustment"]);
    expect(mv[0].qtyAfter).toBe(after.quantity);
  });
  it("rejects invalid quantities and negative stock", async () => {
    const { c } = await signup();
    const i = (await c.post("/api/inventory/items").send(item({ openingQty: 2 }))).body.item;
    for (const q of [0, -1, 1.5, "3"]) expect((await c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "sale", quantity: q })).status).toBe(422);
    const r = await c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "sale", quantity: 3 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("insufficient_stock");
    expect((await c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "adjustment", quantity: 1 })).status).toBe(400);
  });
  it("never oversells under concurrent stock-outs", async () => {
    const { c } = await signup();
    const i = (await c.post("/api/inventory/items").send(item({ openingQty: 10 }))).body.item;
    const rs = await Promise.all(Array.from({ length: 25 }, () => c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "sale", quantity: 1 })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(10);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(15);
    const items = (await c.get("/api/inventory/items")).body.items;
    expect(items[0].quantity).toBe(0);
  });
  it("does not lose concurrent stock-ins", async () => {
    const { c } = await signup();
    const i = (await c.post("/api/inventory/items").send(item({ openingQty: 0 }))).body.item;
    await Promise.all(Array.from({ length: 20 }, () => c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "stock_in", quantity: 2, unitCostPaise: 11000 })));
    expect((await c.get("/api/inventory/items")).body.items[0].quantity).toBe(40);
  });
  it("uses weighted-average cost for valuation", async () => {
    const { c } = await signup();
    const i = (await c.post("/api/inventory/items").send(item({ openingQty: 10, costPaise: 1000 }))).body.item;
    const r = await c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "stock_in", quantity: 10, unitCostPaise: 2000 });
    expect(r.body.item.costPaise).toBe(1500);
    const d = (await c.get("/api/inventory/dashboard")).body;
    expect(d.totals.valuePaise).toBe(20 * 1500);
    expect(d.valuationMethod).toMatch(/Weighted-average/);
  });
  it("rejects duplicate SKUs per user but allows the same SKU for another user", async () => {
    const a = await signup(); const b = await signup();
    await a.c.post("/api/inventory/items").send(item()).expect(201);
    const dup = await a.c.post("/api/inventory/items").send(item({ name: "Other" }));
    expect(dup.status).toBe(409); expect(dup.body.code).toBe("duplicate_sku");
    await b.c.post("/api/inventory/items").send(item()).expect(201);
  });
  it("isolates data between businesses", async () => {
    const a = await signup(); const b = await signup();
    const i = (await a.c.post("/api/inventory/items").send(item())).body.item;
    expect((await b.c.post(`/api/inventory/items/${i.id}/movements`).send({ type: "stock_in", quantity: 1 })).status).toBe(404);
    expect((await b.c.put(`/api/inventory/items/${i.id}`).send(item())).status).toBe(404);
    expect((await b.c.get("/api/inventory/items")).body.items).toHaveLength(0);
    expect((await b.c.get("/api/inventory/movements")).body.movements).toHaveLength(0);
  });
  it("flags low stock and expiry; suggests reorder quantity", async () => {
    const { c } = await signup();
    const soon = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    await c.post("/api/inventory/items").send(item({ sku: "A", openingQty: 2, reorderLevel: 5, expiryDate: soon })).expect(201);
    await c.post("/api/inventory/items").send(item({ sku: "B", openingQty: 50, expiryDate: past })).expect(201);
    await c.post("/api/inventory/items").send(item({ sku: "C", openingQty: 50, expiryDate: null })).expect(201);
    const d = (await c.get("/api/inventory/dashboard")).body;
    expect(d.totals.lowStock).toBe(1);
    expect(d.reorder[0].suggestedQty).toBe(8);
    expect(d.expiring.map((x: any) => x.sku)).toEqual(["A"]);
    expect(d.expired.map((x: any) => x.sku)).toEqual(["B"]);
  });
  it("enforces the free product limit", async () => {
    const { c } = await signup();
    const rows = Array.from({ length: 26 }, (_, n) => ({ name: `P${n}`, sku: `S${n}`, price: "10", cost: "5", quantity: "1" }));
    const r = await c.post("/api/inventory/import").send({ rows, commit: true });
    expect(r.status).toBe(402);
  });
  it("CSV import previews errors, skips duplicates, then commits", async () => {
    const { c } = await signup();
    await c.post("/api/inventory/items").send(item({ sku: "EXIST" })).expect(201);
    const rows = [
      { name: "Good", sku: "G1", price: "₹1,250.50", cost: "900", quantity: "5", expiry_date: "2027-01-31" },
      { name: "", sku: "G2" }, { name: "BadQty", sku: "G3", quantity: "-4" }, { name: "BadDate", sku: "G4", expiry_date: "31/01/2027" },
      { name: "Dup", sku: "g1" }, { name: "Existing", sku: "exist" }, { name: "BadPrice", sku: "G5", price: "abc" },
    ];
    const preview = (await c.post("/api/inventory/import").send({ rows, commit: false })).body;
    expect(preview.committed).toBe(false);
    expect(preview.summary).toEqual({ ok: 1, errors: 5, skipped: 1 });
    expect((await c.get("/api/inventory/items")).body.items).toHaveLength(1); // nothing written on preview
    const done = (await c.post("/api/inventory/import").send({ rows, commit: true })).body;
    expect(done.created).toBe(1);
    const g1 = (await c.get("/api/inventory/items?q=G1")).body.items[0];
    expect(g1.pricePaise).toBe(125050);
    expect(g1.quantity).toBe(5);
  });
  it("exports CSV that can be re-imported (restore)", async () => {
    const a = await signup();
    await a.c.post("/api/inventory/items").send(item({ sku: "R1", name: "Restore, me" })).expect(201);
    const csv = (await a.c.get("/api/inventory/export.csv")).text;
    expect(csv).toContain('"Restore, me"');
    const { parseCsv } = await import("@ek/shared");
    const [head, ...body] = parseCsv(csv);
    const rows = body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace("﻿", ""), r[i]])));
    const b = await signup();
    const res = (await b.c.post("/api/inventory/import").send({ rows, commit: true })).body;
    expect(res.created).toBe(1);
    expect((await b.c.get("/api/inventory/items")).body.items[0].quantity).toBe(10);
  });
});
