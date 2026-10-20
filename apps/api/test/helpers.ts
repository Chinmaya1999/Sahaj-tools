import request from "supertest";
import { createApp } from "../src/app.js";
import { ensureAdmin } from "../src/bootstrap.js";

export const app = createApp({ rateLimits: false });
let n = 0;
export const uniqueEmail = (p = "user") => `${p}${Date.now()}${n++}@test.local`;
export const PASSWORD = "Sup3r-secret-pass";

export function client(a = app) {
  return request.agent(a).set("X-Requested-With", "ek");
}
export async function signup(name = "Test User") {
  const c = client();
  const email = uniqueEmail();
  const r = await c.post("/api/auth/register").send({ name, email, password: PASSWORD });
  if (r.status !== 201) throw new Error("signup failed " + JSON.stringify(r.body));
  return { c, email, id: r.body.user.id as string };
}
export async function adminClient() {
  await ensureAdmin();
  const c = client();
  const r = await c.post("/api/auth/login").send({ email: "admin@test.local", password: "Admin-Test-Pass-1" });
  if (r.status !== 200) throw new Error("admin login failed " + JSON.stringify(r.body));
  return c;
}
export const business = { name: "Sharma Electricals", address: "12 Main Road, Bhubaneswar", phone: "9876543210", email: "", taxId: "", taxLabel: "GSTIN", invoicePrefix: "INV", quotePrefix: "QT", defaultTaxPercent: 18, defaultNotes: "" };
export const invoiceBody = (over: Record<string, unknown> = {}) => ({
  kind: "invoice", customer: { name: "Ravi Kumar" }, issueDate: "2026-10-01", dueDate: "2026-10-15",
  lines: [{ description: "Wiring work", quantity: 2, ratePaise: 50000, taxPercent: 18 }, { description: "Switch", quantity: 1, ratePaise: 12345, taxPercent: 5 }],
  discount: { type: "none" }, paidPaise: 0, notes: "", template: "classic", issue: true, ...over,
});
