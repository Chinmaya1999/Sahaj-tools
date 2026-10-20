import { PLANS, freePlanFor, planById, type Plan, type ProductSlug } from "@ek/shared";
import type { Types } from "mongoose";
import { Entitlement } from "../models/index.js";
import { upgradeRequired } from "../lib/http.js";

type Limits = Plan["limits"];
export interface Access {
  product: ProductSlug;
  planIds: string[];
  limits: Limits;
  credits: number;
  expiresAt: Date | null;
  paid: boolean;
}

function mergeLimits(all: Limits[]): Limits {
  const out: Limits = {};
  for (const l of all) for (const [k, v] of Object.entries(l)) {
    const cur = out[k];
    if (cur === undefined) out[k] = v;
    else if (v === null || cur === null) out[k] = null; // unlimited wins
    else if (typeof v === "boolean" || typeof cur === "boolean") out[k] = Boolean(v) || Boolean(cur);
    else out[k] = Math.max(Number(cur), Number(v));
  }
  return out;
}

export async function activeEntitlements(user: Types.ObjectId | string, product?: ProductSlug) {
  const now = new Date();
  return Entitlement.find({
    user, status: "active", ...(product ? { product } : {}),
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).lean();
}

export async function getAccess(user: Types.ObjectId | string, product: ProductSlug): Promise<Access> {
  const ents = await activeEntitlements(user, product);
  const plans = ents.map((e) => planById(e.planId)).filter((p): p is Plan => !!p);
  const limits = mergeLimits([freePlanFor(product).limits, ...plans.map((p) => p.limits)]);
  const credits = ents.filter((e) => e.kind === "credits").reduce((a, e) => a + (e.creditsRemaining ?? 0), 0);
  const exp = ents.map((e) => e.expiresAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { product, planIds: ents.map((e) => e.planId), limits, credits, expiresAt: exp, paid: ents.length > 0 };
}

export async function allAccess(user: Types.ObjectId | string) {
  const slugs = [...new Set(PLANS.map((p) => p.product))];
  return Promise.all(slugs.map((s) => getAccess(user, s)));
}

/** Atomically spend one credit for a product. Returns false when none are left. */
export async function spendCredit(user: Types.ObjectId | string, product: ProductSlug): Promise<boolean> {
  const r = await Entitlement.findOneAndUpdate(
    { user, product, kind: "credits", status: "active", creditsRemaining: { $gt: 0 } },
    { $inc: { creditsRemaining: -1 } },
    { sort: { createdAt: 1 } },
  );
  return !!r;
}

export function requireLimit(ok: boolean, message: string, product: ProductSlug) {
  if (!ok) throw upgradeRequired(message, product);
}
