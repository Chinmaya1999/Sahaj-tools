import { Router } from "express";
import { ASSETS } from "@ek/shared";
import { z } from "zod";
import { env } from "../env.js";
import { requireAuth } from "../lib/auth.js";
import { forbidden, notFound, parse, wrap } from "../lib/http.js";
import { hmac, safeEqual } from "../lib/security.js";
import { DownloadRecord } from "../models/index.js";
import { activeEntitlements } from "../services/access.js";
import { buildAsset } from "../services/assets.js";

export const downloadsRouter = Router();
downloadsRouter.use(requireAuth);

async function hasAccess(userId: any, assetId: string) {
  const asset = ASSETS.find((a) => a.id === assetId);
  if (!asset) return false;
  const ents = await activeEntitlements(userId);
  return ents.some((e) => asset.requiresPlan.includes(e.planId));
}
const sign = (uid: string, assetId: string, exp: number) => hmac(env.DOWNLOAD_SECRET, `${uid}|${assetId}|${exp}`);

downloadsRouter.get("/", wrap(async (req, res) => {
  const out = [];
  for (const a of ASSETS) out.push({ ...a, unlocked: await hasAccess(req.user!._id, a.id) });
  res.json({ assets: out });
}));

downloadsRouter.get("/history", wrap(async (req, res) => {
  const rows = await DownloadRecord.find({ user: req.user!._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ history: rows.map((r) => ({ assetId: r.assetId, event: r.event, at: (r as any).createdAt })) });
}));

/** Step 1: authorised user asks for a short-lived link. */
downloadsRouter.post("/:assetId/link", wrap(async (req, res) => {
  const assetId = String(req.params.assetId);
  if (!ASSETS.some((a) => a.id === assetId)) throw notFound("Download not found");
  if (!(await hasAccess(req.user!._id, assetId))) {
    await DownloadRecord.create({ user: req.user!._id, assetId, event: "denied", ip: req.ip });
    throw forbidden("Purchase a plan that includes this download to unlock it");
  }
  const exp = Math.floor(Date.now() / 1000) + env.DOWNLOAD_LINK_SECONDS;
  await DownloadRecord.create({ user: req.user!._id, assetId, event: "link_issued", ip: req.ip });
  res.json({ url: `/api/downloads/${assetId}/file?exp=${exp}&sig=${sign(req.user!.id, assetId, exp)}`, expiresInSeconds: env.DOWNLOAD_LINK_SECONDS });
}));

/** Step 2: link must be unexpired, signed for THIS user, and entitlement is re-checked (so refunds revoke access). */
downloadsRouter.get("/:assetId/file", wrap(async (req, res) => {
  const { exp, sig } = parse(z.object({ exp: z.coerce.number().int(), sig: z.string().min(10).max(200) }), req.query);
  const assetId = String(req.params.assetId);
  if (exp < Math.floor(Date.now() / 1000) || !safeEqual(sign(req.user!.id, assetId, exp), sig)) {
    await DownloadRecord.create({ user: req.user!._id, assetId, event: "denied", ip: req.ip });
    throw forbidden("This download link is invalid or has expired. Request a new one from your library.");
  }
  if (!(await hasAccess(req.user!._id, assetId))) throw forbidden("You no longer have access to this download");
  const file = await buildAsset(assetId);
  if (!file) throw notFound("Download not found");
  await DownloadRecord.create({ user: req.user!._id, assetId, event: "downloaded", ip: req.ip });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.data);
}));
