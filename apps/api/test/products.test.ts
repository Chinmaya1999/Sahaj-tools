import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { adminClient, app, client, signup } from "./helpers.js";
import { setLlmForTests } from "../src/services/llm.js";

const resume = (o: Record<string, unknown> = {}) => ({ title: "R", template: "classic", personal: { fullName: "Asha Mohanty", headline: "", email: "a@b.co", phone: "", location: "", links: "" }, summary: "", experience: [], education: [], skills: ["React"], projects: [], certifications: [], languages: [], coverLetter: "", jobDescription: "", ...o });
const page = (o: Record<string, unknown> = {}) => ({ slug: "my-salon", businessName: "My Salon", tagline: "", about: "", phone: "", whatsapp: "", email: "", website: "", address: "", mapUrl: "", hours: "", upiId: "", services: [], accent: "#4f46e5", published: false, ...o });

describe("resume", () => {
  it("saves unicode, special characters and long inputs; enforces free limits and template gating", async () => {
    const { c } = await signup();
    const r = await c.post("/api/resumes").send(resume({ summary: "ଓଡ଼ିଶା <b>&</b> 日本語 😀 " + "x".repeat(1000), personal: { fullName: "ଅନିତା ମହାନ୍ତି", headline: "", email: "", phone: "", location: "", links: "" } }));
    expect(r.status).toBe(201);
    expect((await c.get(`/api/resumes/${r.body.item.id}`)).body.item.data.personal.fullName).toBe("ଅନିତା ମହାନ୍ତି");
    expect((await c.post("/api/resumes").send(resume({ summary: "y".repeat(1300) }))).status).toBe(422); // too long
    expect((await c.post("/api/resumes").send(resume({ template: "modern" }))).status).toBe(402);
    await c.post("/api/resumes").send(resume()).expect(201);
    expect((await c.post("/api/resumes").send(resume())).status).toBe(402); // free plan = 2 saved resumes
  });
  it("isolates resumes between users", async () => {
    const a = await signup(); const b = await signup();
    const r = (await a.c.post("/api/resumes").send(resume())).body.item;
    expect((await b.c.get(`/api/resumes/${r.id}`)).status).toBe(404);
    expect((await b.c.delete(`/api/resumes/${r.id}`)).status).toBe(404);
  });
  it("compares keywords without AI", async () => {
    const { c } = await signup();
    const r = await c.post("/api/resumes/analyze").send({ resumeText: "Built React apps", jobDescription: "React and MongoDB developer. MongoDB required." });
    expect(r.body.missing).toContain("mongodb");
    expect(r.body.matched).toContain("react");
  });
  it("AI: graceful failure when disabled or erroring; core editing unaffected", async () => {
    const { c } = await signup();
    const facts = "I built a billing web app with React for a local shop";
    const off = await c.post("/api/resumes/ai").send({ task: "summary", facts });
    expect(off.status).toBe(503);
    expect(off.body.code).toBe("ai_unavailable");
    setLlmForTests({ name: "broken", complete: async () => { throw new Error("boom"); } });
    expect((await c.post("/api/resumes/ai").send({ task: "summary", facts })).status).toBe(503);
    await c.post("/api/resumes").send(resume()).expect(201);
    setLlmForTests(null);
  });
  it("AI: validates output, labels it, and rejects invented figures", async () => {
    const { c } = await signup();
    const facts = "I built a billing web app with React for a local shop";
    setLlmForTests({ name: "fake", complete: async () => ({ text: '{"text":"Developer who built a billing app with React for a local shop."}', inputTokens: 10, outputTokens: 10 }) });
    const ok = await c.post("/api/resumes/ai").send({ task: "summary", facts });
    expect(ok.status).toBe(200);
    expect(ok.body.aiGenerated).toBe(true);
    setLlmForTests({ name: "liar", complete: async () => ({ text: '{"text":"Led a team of 40 and increased revenue by 300%."}', inputTokens: 1, outputTokens: 1 }) });
    const bad = await c.post("/api/resumes/ai").send({ task: "summary", facts });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("ai_invented");
    setLlmForTests({ name: "junk", complete: async () => ({ text: "sorry, no json", inputTokens: 1, outputTokens: 1 }) });
    expect((await c.post("/api/resumes/ai").send({ task: "summary", facts })).status).toBe(503);
    setLlmForTests(null);
  });
  it("AI: per-user daily limit is enforced", async () => {
    const { c } = await signup();
    setLlmForTests({ name: "fake", complete: async () => ({ text: '{"options":["Join us!"]}', inputTokens: 1, outputTokens: 1 }) });
    let last = 200;
    for (let i = 0; i < 16; i++) last = (await c.post("/api/invitations/ai").send({ occasion: "birthday", language: "en" })).status;
    expect(last).toBe(429);
    setLlmForTests(null);
  });
});

describe("invitations", () => {
  it("validates and stores designs per user", async () => {
    const a = await signup(); const b = await signup();
    const body = { title: "Bday", occasion: "birthday", language: "or", layout: "centered", fields: { heading: "ଜନ୍ମଦିନ", names: "ରାମ", date: "", time: "", venue: "", contact: "", message: "" }, colours: { background: "#ffffff", text: "#111111", accent: "#4f46e5" } };
    const d = (await a.c.post("/api/invitations").send(body)).body.item;
    expect(d.data.fields.heading).toBe("ଜନ୍ମଦିନ");
    expect((await a.c.post("/api/invitations").send({ ...body, colours: { ...body.colours, accent: "red" } })).status).toBe(422);
    expect((await b.c.put(`/api/invitations/${d.id}`).send(body)).status).toBe(404);
  });
});

describe("qr business page", () => {
  it("free users can save a draft but not publish; paid can publish and it is publicly readable", async () => {
    const { c, email } = await signup();
    await c.put("/api/pages/mine").send(page()).expect(200);
    const pub = await c.put("/api/pages/mine").send(page({ published: true }));
    expect(pub.status).toBe(402);
    expect((await request(app).get("/api/public/pages/my-salon")).status).toBe(404); // draft is not public
    const admin = await adminClient();
    await admin.post("/api/admin/entitlements/grant").send({ email, planId: "qr-page-year" }).expect(201);
    await c.put("/api/pages/mine").send(page({ published: true, businessName: "<img src=x onerror=alert(1)>" })).expect(200);
    const r = await request(app).get("/api/public/pages/my-salon");
    expect(r.status).toBe(200);
    expect(r.body.page.businessName).toBe("<img src=x onerror=alert(1)>"); // stored verbatim; React escapes it at render time
    expect(r.headers["content-type"]).toContain("application/json");
  });
  it("handles slug collisions and invalid slugs; normalises URLs; rejects script URLs", async () => {
    const a = await signup(); const b = await signup();
    await a.c.put("/api/pages/mine").send(page({ slug: "taken-slug" })).expect(200);
    expect((await b.c.put("/api/pages/mine").send(page({ slug: "taken-slug" }))).status).toBe(409);
    for (const s of ["admin", "A", "bad slug", "-x-", "a--b", "x".repeat(50)]) expect((await b.c.put("/api/pages/mine").send(page({ slug: s }))).status, s).toBe(400);
    expect((await request(app).get("/api/public/pages-available?slug=taken-slug")).body.available).toBe(false);
    expect((await request(app).get("/api/public/pages-available?slug=free-slug-1")).body.available).toBe(true);
    expect((await b.c.put("/api/pages/mine").send(page({ slug: "ok-slug", website: "javascript:alert(1)" }))).status).toBe(400);
    const ok = await b.c.put("/api/pages/mine").send(page({ slug: "ok-slug", website: "example.com", whatsapp: "+91 98765-43210" }));
    expect(ok.body.page.website).toBe("https://example.com/");
    expect(ok.body.page.whatsapp).toBe("919876543210");
    expect((await b.c.put("/api/pages/mine").send(page({ slug: "ok-slug", upiId: "bad" }))).status).toBe(400);
  });
});

describe("admin & platform security", () => {
  it("admin APIs reject anonymous users and customers", async () => {
    const { c } = await signup();
    for (const p of ["/api/admin/stats", "/api/admin/users", "/api/admin/orders", "/api/admin/health", "/api/admin/audit"]) {
      expect((await client().get(p)).status, p).toBe(401);
      expect((await c.get(p)).status, p).toBe(403);
    }
    expect((await c.put("/api/admin/catalog/plan/inventory-pro").send({ pricePaise: 100 })).status).toBe(403);
  });
  it("admin price override changes what checkout charges; audit trail is written", async () => {
    const admin = await adminClient(); const { c } = await signup();
    await admin.put("/api/admin/catalog/plan/pdf-batch").send({ pricePaise: 3900 }).expect(200);
    expect((await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "pdf-batch" })).body.order.amountPaise).toBe(3900);
    await admin.put("/api/admin/catalog/plan/pdf-batch").send({ active: false }).expect(200);
    expect((await c.post("/api/billing/checkout").send({ itemType: "plan", itemId: "pdf-batch" })).status).toBe(404);
    await admin.put("/api/admin/catalog/plan/pdf-batch").send({ pricePaise: 2900, active: true }).expect(200);
    const log = (await admin.get("/api/admin/audit")).body.items;
    expect(log.some((l: any) => l.action === "admin.plan_update")).toBe(true);
    const stats = (await admin.get("/api/admin/stats")).body;
    expect(stats.users).toBeGreaterThan(0);
  });
  it("unpublished products disappear from the public catalog", async () => {
    const admin = await adminClient();
    await admin.put("/api/admin/catalog/product/photo-tools").send({ published: false }).expect(200);
    expect((await client().get("/api/catalog")).body.products.some((p: any) => p.slug === "photo-tools")).toBe(false);
    await admin.put("/api/admin/catalog/product/photo-tools").send({ published: true }).expect(200);
  });
  it("support requests are accepted anonymously and validated", async () => {
    const c = client();
    expect((await c.post("/api/support").send({ name: "A", email: "a@b.co", subject: "Help", message: "short" })).status).toBe(422);
    expect((await c.post("/api/support").send({ name: "A", email: "a@b.co", subject: "Help me", message: "My download does not open, please help." })).status).toBe(201);
    const admin = await adminClient();
    expect((await admin.get("/api/admin/support")).body.items.length).toBeGreaterThan(0);
  });
  it("rate limits brute-force login attempts", async () => {
    const limited = createApp({ rateLimits: true, authMax: 5 });
    const c = request.agent(limited).set("X-Requested-With", "ek");
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await c.post("/api/auth/login").send({ email: "nobody@test.local", password: "wrong-password-1" })).status);
    expect(codes.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(codes.slice(5).every((s) => s === 429)).toBe(true);
  });
  it("sets security headers and hides internals in errors", async () => {
    const r = await request(app).get("/api/health");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    const bad = await client().post("/api/auth/login").set("content-type", "application/json").send("{bad json");
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/at .*\.ts|node_modules/);
  });
  it("sustains concurrent requests", async () => {
    const rs = await Promise.all(Array.from({ length: 60 }, () => request(app).get("/api/catalog")));
    expect(rs.every((r) => r.status === 200)).toBe(true);
  });
});
