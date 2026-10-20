import { describe, expect, it } from "vitest";
import { PASSWORD, client, signup, uniqueEmail, app } from "./helpers.js";
import { devMailbox } from "../src/services/mail.js";
import { PasswordReset, User } from "../src/models/index.js";
import request from "supertest";

describe("auth", () => {
  it("registers, logs in and returns the session user", async () => {
    const { c, email } = await signup("Asha");
    const me = await c.get("/api/auth/me");
    expect(me.body.user.email).toBe(email);
    expect(JSON.stringify(me.body)).not.toContain("passwordHash");
    const stored = await User.findOne({ email });
    expect(stored!.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
  it("rejects duplicate email, weak passwords, bad email", async () => {
    const { email } = await signup();
    const c = client();
    expect((await c.post("/api/auth/register").send({ name: "A", email, password: PASSWORD })).status).toBe(409);
    expect((await c.post("/api/auth/register").send({ name: "A", email: uniqueEmail(), password: "short1" })).status).toBe(422);
    expect((await c.post("/api/auth/register").send({ name: "A", email: uniqueEmail(), password: "onlyletterslongpass" })).status).toBe(422);
    expect((await c.post("/api/auth/register").send({ name: "A", email: "nope", password: PASSWORD })).status).toBe(422);
  });
  it("fails login with generic message", async () => {
    const { email } = await signup();
    const c = client();
    const bad = await c.post("/api/auth/login").send({ email, password: "wrong-password-1" });
    const unknown = await c.post("/api/auth/login").send({ email: uniqueEmail(), password: "wrong-password-1" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });
  it("blocks unauthenticated access to private routes", async () => {
    const c = client();
    for (const p of ["/api/invoices", "/api/inventory/items", "/api/resumes", "/api/billing/orders", "/api/downloads", "/api/account/export"]) {
      expect((await c.get(p)).status, p).toBe(401);
    }
  });
  it("password reset: single use, expiry, and session invalidation", async () => {
    const { c, email } = await signup();
    const anon = client();
    expect((await anon.post("/api/auth/forgot").send({ email: uniqueEmail() })).status).toBe(200); // no enumeration
    devMailbox.length = 0;
    await anon.post("/api/auth/forgot").send({ email });
    const token = /token=([\w-]+)/.exec(devMailbox.at(-1)!.text)![1];
    const newPass = "Brand-new-pass-9";
    expect((await anon.post("/api/auth/reset").send({ token, password: newPass })).status).toBe(200);
    expect((await anon.post("/api/auth/reset").send({ token, password: newPass })).status).toBe(400); // reuse
    expect((await c.get("/api/auth/me")).body.user).toBeNull(); // old session killed
    expect((await client().post("/api/auth/login").send({ email, password: newPass })).status).toBe(200);
    // expired token
    await anon.post("/api/auth/forgot").send({ email });
    const t2 = /token=([\w-]+)/.exec(devMailbox.at(-1)!.text)![1];
    await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await anon.post("/api/auth/reset").send({ token: t2, password: newPass })).status).toBe(400);
  });
  it("logout destroys the session", async () => {
    const { c } = await signup();
    await c.post("/api/auth/logout");
    expect((await c.get("/api/invoices")).status).toBe(401);
  });
  it("blocks state-changing requests without the CSRF header / from foreign origins", async () => {
    const r = await request(app).post("/api/auth/login").send({ email: "a@b.co", password: "x" });
    expect(r.status).toBe(403);
    const r2 = await request(app).post("/api/auth/login").set("X-Requested-With", "ek").set("Origin", "https://evil.example").send({ email: "a@b.co", password: "x" });
    expect(r2.status).toBe(403);
  });
  it("exports and deletes account data", async () => {
    const { c, email } = await signup();
    const exp = await c.get("/api/account/export");
    expect(exp.body.user.email).toBe(email);
    expect(exp.body.user.passwordHash).toBeUndefined();
    expect((await c.delete("/api/account").send({ password: "wrong-password-1", confirm: "DELETE" })).status).toBe(401);
    expect((await c.delete("/api/account").send({ password: PASSWORD, confirm: "DELETE" })).status).toBe(200);
    expect(await User.findOne({ email })).toBeNull();
  });
});
