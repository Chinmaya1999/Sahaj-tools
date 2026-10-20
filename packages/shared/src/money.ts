import Decimal from "decimal.js";

/** All money in the system is stored as integer paise (1 INR = 100 paise). */
export const CURRENCY = "INR";
export const CURRENCY_SYMBOL = "₹";

export function rupeesToPaise(rupees: number | string): number {
  const d = new Decimal(rupees);
  if (!d.isFinite()) throw new Error("Invalid amount");
  return d.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function paiseToRupees(paise: number): string {
  return new Decimal(paise).div(100).toFixed(2);
}

export function formatInr(paise: number, opts: { compact?: boolean } = {}): string {
  const rupees = new Decimal(paise).div(100);
  const whole = rupees.isInteger() && opts.compact !== false;
  const n = Number(rupees.toFixed(whole ? 0 : 2));
  return `${CURRENCY_SYMBOL}${n.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}
