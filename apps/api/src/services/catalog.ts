import { PromoCode } from "../models/index.js";
import { BUNDLES, PLANS, PRODUCTS, ASSETS, type Bundle, type Plan, type ProductInfo, bundleById, planById } from "@ek/shared";
import { CatalogOverride } from "../models/index.js";

/** Catalog with admin overrides (price / purchasable / published) applied. */
export async function effectiveCatalog() {
  const ovs = await CatalogOverride.find().lean();
  const by = new Map(ovs.map((o) => [o.key, o]));
  const plans: (Plan & { active: boolean })[] = PLANS.map((p) => {
    const o = by.get(p.id);
    return { ...p, pricePaise: p.kind === "free" ? 0 : (o?.pricePaise ?? p.pricePaise), active: o?.active ?? true };
  });
  const bundles: (Bundle & { active: boolean })[] = BUNDLES.map((b) => {
    const o = by.get(b.id);
    return { ...b, pricePaise: o?.pricePaise ?? b.pricePaise, active: o?.active ?? true };
  });
  const products: (ProductInfo & { published: boolean })[] = PRODUCTS.map((p) => ({ ...p, published: by.get(p.slug)?.published ?? true }));
  return { products, plans, bundles, assets: ASSETS };
}

/** Authoritative price for checkout. Never uses client-supplied amounts. */
export async function priceFor(itemType: "plan" | "bundle", itemId: string) {
  const cat = await effectiveCatalog();
  if (itemType === "plan") {
    const base = planById(itemId); const plan = cat.plans.find((p) => p.id === itemId);
    if (!base || !plan) return null;
    return { title: `${base.name} – ${PRODUCTS.find((x) => x.slug === base.product)?.name}`, amountPaise: plan.pricePaise, planIds: [base.id], active: plan.active && plan.kind !== "free" && (cat.products.find((p) => p.slug === base.product)?.published ?? true) };
  }
  const base = bundleById(itemId); const b = cat.bundles.find((x) => x.id === itemId);
  if (!base || !b) return null;
  return { title: base.name, amountPaise: b.pricePaise, planIds: base.planIds, active: b.active };
}

/** Validates a promo code against an amount. Returns the discount, or a user-facing reason it cannot be used. */
export async function applyPromo(code: string | undefined, amountPaise: number): Promise<{ ok: true; code: string; discountPaise: number; finalPaise: number } | { ok: false; reason: string } | null> {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const p = await PromoCode.findOne({ code: c });
  if (!p || !p.active) return { ok: false, reason: "That code is not valid." };
  if (p.expiresAt && p.expiresAt < new Date()) return { ok: false, reason: "That code has expired." };
  if (p.maxUses !== null && p.maxUses !== undefined && p.uses >= p.maxUses) return { ok: false, reason: "That code has been fully used." };
  const discountPaise = Math.round((amountPaise * p.percentOff) / 100);
  const finalPaise = Math.max(amountPaise - discountPaise, 100);
  return { ok: true, code: p.code, discountPaise: amountPaise - finalPaise, finalPaise };
}
