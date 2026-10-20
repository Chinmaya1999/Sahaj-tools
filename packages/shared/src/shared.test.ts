import { describe, expect, it } from "vitest";
import { calculateDocument, paymentStatus } from "./invoiceCalc";
import { buildQrPayload, normalizeUrl, parseCsv, toCsv, isValidSlug, keywordCompare } from "./validate";
import { formatInr, rupeesToPaise } from "./money";
import { PLANS, BUNDLES, planById } from "./catalog";
import { invoiceInputSchema } from "./schemas";

describe("money", () => {
  it("avoids floating point errors", () => {
    expect(rupeesToPaise("0.1") + rupeesToPaise("0.2")).toBe(30);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(formatInr(2900)).toBe("₹29");
    expect(formatInr(2950)).toBe("₹29.50");
  });
});

describe("calculateDocument", () => {
  it("computes subtotal, tax and total", () => {
    const t = calculateDocument([{ description: "a", quantity: 2, ratePaise: 50000, taxPercent: 18 }, { description: "b", quantity: 1, ratePaise: 12345, taxPercent: 5 }]);
    expect(t.subtotalPaise).toBe(112345);
    expect(t.taxPaise).toBe(18000 + 617); // 5% of 123.45 = 6.1725 -> 6.17
    expect(t.totalPaise).toBe(112345 + 18617);
  });
  it("allocates percent discount before tax and rounds half up", () => {
    const t = calculateDocument([{ description: "a", quantity: 3, ratePaise: 3333, taxPercent: 18 }], { type: "percent", value: 10 });
    expect(t.subtotalPaise).toBe(9999);
    expect(t.discountPaise).toBe(1000);
    expect(t.taxableTotalPaise).toBe(8999);
    expect(t.taxPaise).toBe(1620); // 8999*0.18=1619.82
    expect(t.totalPaise).toBe(10619);
  });
  it("fixed discount allocation sums exactly", () => {
    const t = calculateDocument(
      [1, 2, 3].map((q) => ({ description: "x", quantity: q, ratePaise: 1001, taxPercent: 0 })),
      { type: "amount", valuePaise: 1000 },
    );
    expect(t.lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(1000);
  });
  it("supports fractional quantity and zero tax", () => {
    const t = calculateDocument([{ description: "a", quantity: 1.5, ratePaise: 1000, taxPercent: 0 }]);
    expect(t.totalPaise).toBe(1500);
  });
  it("rejects invalid input", () => {
    const line = { description: "a", quantity: 1, ratePaise: 100, taxPercent: 0 };
    expect(() => calculateDocument([{ ...line, quantity: 0 }])).toThrow();
    expect(() => calculateDocument([{ ...line, quantity: -1 }])).toThrow();
    expect(() => calculateDocument([{ ...line, quantity: 1.0001 }])).toThrow();
    expect(() => calculateDocument([{ ...line, ratePaise: -5 }])).toThrow();
    expect(() => calculateDocument([{ ...line, taxPercent: 101 }])).toThrow();
    expect(() => calculateDocument([line], { type: "amount", valuePaise: 101 })).toThrow();
    expect(() => calculateDocument([line], { type: "percent", value: 120 })).toThrow();
  });
});

describe("paymentStatus", () => {
  it("never reports unpaid invoices as paid", () => {
    expect(paymentStatus(1000, 0)).toBe("unpaid");
    expect(paymentStatus(1000, 400)).toBe("partial");
    expect(paymentStatus(1000, 1000)).toBe("paid");
    expect(paymentStatus(1000, 0, "2000-01-01")).toBe("overdue");
  });
});

describe("validators", () => {
  it("normalizes and rejects urls", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeUrl("data:text/html,x")).toThrow();
    expect(() => normalizeUrl("https://u:p@example.com")).toThrow();
  });
  it("builds payloads", () => {
    expect(buildQrPayload("whatsapp", { phone: "+91 98765 43210", message: "Hi there" })).toBe("https://wa.me/919876543210?text=Hi%20there");
    expect(buildQrPayload("upi", { upiId: "shop@okbank", payeeName: "My Shop", amount: "50" })).toBe("upi://pay?pa=shop%40okbank&cu=INR&pn=My%20Shop&am=50");
    expect(() => buildQrPayload("upi", { upiId: "bad" })).toThrow();
    expect(buildQrPayload("contact", { name: "A, B", phone: "98765" })).toContain("FN:A\\, B");
  });
  it("validates slugs", () => {
    expect(isValidSlug("my-salon")).toBe(true);
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("Bad_Slug")).toBe(false);
  });
  it("parses and writes CSV safely", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
    expect(toCsv([["=HYPERLINK(\"x\")", 5, "-3"]])).toBe(`"'=HYPERLINK(""x"")",5,-3`);
  });
  it("compares keywords deterministically", () => {
    const r = keywordCompare("We need React and Node.js with MongoDB. React experience essential.", "I built apps in React and Node.js");
    expect(r.matched).toContain("react");
    expect(r.missing).toContain("mongodb");
  });
});

describe("catalog", () => {
  it("has consistent plan references", () => {
    for (const b of BUNDLES) for (const id of b.planIds) expect(planById(id)).toBeTruthy();
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLANS.length);
  });
  it("invoice schema rejects bad lines", () => {
    const base = { kind: "invoice", customer: { name: "A" }, issueDate: "2025-01-01", lines: [{ description: "x", quantity: 0, ratePaise: 100, taxPercent: 0 }] };
    expect(invoiceInputSchema.safeParse(base).success).toBe(false);
  });
});

import { calcSale, canMove, orderOutstanding, reorderPoint, suggestReorder, suggestSku, productFormSchema, adjustSchema } from "./ministock";
describe("ministock calcs", () => {
  it("calculates line totals, shares the order discount exactly and adds tax", () => {
    const t = calcSale([{ quantity: 2, unitPricePaise: 79900, discountPaise: 1000, taxPercent: 5 }, { quantity: 1, unitPricePaise: 50000, discountPaise: 0, taxPercent: 12 }], 3333, 4000);
    expect(t.subtotalPaise).toBe(2 * 79900 - 1000 + 50000);
    expect(t.lines.reduce((a, l) => a + l.orderDiscountSharePaise, 0)).toBe(3333);
    expect(t.totalPaise).toBe(t.taxablePaise + t.taxPaise + 4000);
    expect(t.taxablePaise).toBe(t.subtotalPaise - 3333);
  });
  it("rejects discounts larger than the value", () => {
    expect(() => calcSale([{ quantity: 1, unitPricePaise: 100, discountPaise: 101, taxPercent: 0 }])).toThrow();
    expect(() => calcSale([{ quantity: 1, unitPricePaise: 100, discountPaise: 0, taxPercent: 0 }], 101)).toThrow();
  });
  it("computes reorder point like the worked example (4/day, 5 days, 8 safety = 28)", () => {
    expect(reorderPoint(4, 5, 8)).toBe(28);
    expect(suggestReorder({ available: 20, incoming: 0, avgDailyDemand: 4, leadTimeDays: 5, safetyStock: 8 })).toMatchObject({ needed: true, reorderPoint: 28, suggestedQty: 28 + 56 - 20 });
    expect(suggestReorder({ available: 20, incoming: 20, avgDailyDemand: 4, leadTimeDays: 5, safetyStock: 8 }).needed).toBe(false);
  });
  it("controls the order lifecycle and balances", () => {
    expect(canMove("draft", "confirmed")).toBe(true); expect(canMove("confirmed", "shipped")).toBe(false); expect(canMove("delivered", "packed")).toBe(false);
    expect(orderOutstanding({ totalPaise: 200000, returnedValuePaise: 0, paidPaise: 120000, refundedPaise: 0 })).toBe(80000);
  });
  it("suggests the example SKU and validates the product form", () => {
    expect(suggestSku({ name: "Hu", ageGroup: "06M", colour: "White", productType: "Full sleeve shirt", size: "", variant: "" })).toBe("HU-06M-WHI-FUL");
    expect(productFormSchema.safeParse({ name: "x", costPaise: -1, pricePaise: 1 }).success).toBe(false);
    expect(productFormSchema.safeParse({ name: "x", costPaise: 1, pricePaise: 1, openingQty: 1.5 }).success).toBe(false);
    expect(adjustSchema.safeParse({ itemId: "a".repeat(24), mode: "remove", quantity: 0, reason: "loss" }).success).toBe(false);
  });
});
