import Decimal from "decimal.js";

export interface LineInput {
  description: string;
  quantity: number | string; // up to 3 decimals
  ratePaise: number; // unit price, integer paise
  taxPercent: number | string; // 0..100, up to 2 decimals
}
export type DiscountInput = { type: "none" } | { type: "percent"; value: number | string } | { type: "amount"; valuePaise: number };

export interface LineResult {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
}
export interface DocumentTotals {
  lines: LineResult[];
  subtotalPaise: number;
  discountPaise: number;
  taxableTotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

const round = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/**
 * Deterministic, decimal-safe document maths. Tax is calculated per line on the
 * amount remaining after the document discount is allocated proportionally
 * (largest-remainder allocation so line discounts always sum to the discount).
 * Prices are treated as tax-exclusive.
 */
export function calculateDocument(lines: LineInput[], discount: DiscountInput = { type: "none" }): DocumentTotals {
  const gross = lines.map((l) => {
    const q = new Decimal(l.quantity);
    if (!q.isFinite() || q.lte(0) || q.decimalPlaces() > 3) throw new Error("Invalid quantity");
    if (!Number.isInteger(l.ratePaise) || l.ratePaise < 0) throw new Error("Invalid rate");
    const t = new Decimal(l.taxPercent);
    if (!t.isFinite() || t.lt(0) || t.gt(100) || t.decimalPlaces() > 2) throw new Error("Invalid tax");
    return round(q.times(l.ratePaise));
  });
  const subtotal = gross.reduce((a, b) => a + b, 0);

  let discountTotal = 0;
  if (discount.type === "percent") {
    const p = new Decimal(discount.value);
    if (!p.isFinite() || p.lt(0) || p.gt(100)) throw new Error("Invalid discount");
    discountTotal = round(new Decimal(subtotal).times(p).div(100));
  } else if (discount.type === "amount") {
    if (!Number.isInteger(discount.valuePaise) || discount.valuePaise < 0) throw new Error("Invalid discount");
    discountTotal = discount.valuePaise;
  }
  if (discountTotal > subtotal) throw new Error("Discount cannot exceed subtotal");

  // largest-remainder allocation of discount across lines
  const alloc = gross.map(() => 0);
  if (discountTotal > 0 && subtotal > 0) {
    const exact = gross.map((g) => new Decimal(discountTotal).times(g).div(subtotal));
    exact.forEach((e, i) => (alloc[i] = e.floor().toNumber()));
    let remaining = discountTotal - alloc.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, frac: e.minus(e.floor()) })).sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
    for (let k = 0; remaining > 0; k = (k + 1) % order.length, remaining--) alloc[order[k].i]++;
  }

  const results: LineResult[] = lines.map((l, i) => {
    const taxable = gross[i] - alloc[i];
    const tax = round(new Decimal(taxable).times(l.taxPercent).div(100));
    return { grossPaise: gross[i], discountPaise: alloc[i], taxablePaise: taxable, taxPaise: tax, totalPaise: taxable + tax };
  });
  const taxPaise = results.reduce((a, r) => a + r.taxPaise, 0);
  return {
    lines: results,
    subtotalPaise: subtotal,
    discountPaise: discountTotal,
    taxableTotalPaise: subtotal - discountTotal,
    taxPaise,
    totalPaise: subtotal - discountTotal + taxPaise,
  };
}

export type PaymentStatus = "unpaid" | "partial" | "paid" | "overdue";
export function paymentStatus(totalPaise: number, paidPaise: number, dueDate?: Date | string | null, now = new Date()): PaymentStatus {
  if (paidPaise >= totalPaise && totalPaise > 0) return "paid";
  if (dueDate && new Date(dueDate).getTime() < now.getTime()) return "overdue";
  return paidPaise > 0 ? "partial" : "unpaid";
}
