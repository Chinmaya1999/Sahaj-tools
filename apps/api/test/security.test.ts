import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers.js";

describe("Content-Security-Policy", () => {
  it("lets payment providers submit checkout forms and load their scripts, frames and API", async () => {
    const csp = String((await request(app).get("/api/health")).headers["content-security-policy"]);
    const dir = (name: string) => csp.split(";").find((d) => d.trim().startsWith(name + " ")) ?? "";
    expect(dir("form-action")).toContain("https://*.cashfree.com");
    expect(dir("script-src")).toContain("https://*.cashfree.com");
    expect(dir("frame-src")).toContain("https://*.cashfree.com"); // the payment window is framed from api.cashfree.com
    expect(dir("connect-src")).toContain("https://*.cashfree.com");
  });
  it("still blocks inline scripts, framing and plugins", async () => {
    const csp = String((await request(app).get("/api/health")).headers["content-security-policy"]);
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src ")) ?? "";
    expect(script).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
