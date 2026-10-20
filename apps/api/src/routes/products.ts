import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { invitationSchema, isValidSlug, keywordCompare, miniPageSchema, normalizeUrl, resumeSchema, digitsOnly } from "@ek/shared";
import { requireAuth } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound, parse, upgradeRequired, wrap } from "../lib/http.js";
import { InvitationDesign, MiniBusinessPage, Resume } from "../models/index.js";
import { getAccess } from "../services/access.js";
import { extractJson, inventedNumbers, llmEnabled, runLlm } from "../services/llm.js";

const oid = (id: string) => { if (!Types.ObjectId.isValid(id)) throw notFound("Not found"); return new Types.ObjectId(id); };

/* ================= Resume ================= */
export const resumeRouter = Router();
resumeRouter.use(requireAuth);
const rv = (r: any) => ({ id: String(r._id), title: r.title, template: r.template, data: r.data, updatedAt: r.updatedAt });

async function checkResumeAccess(userId: Types.ObjectId, template: string, creating: boolean) {
  const a = await getAccess(userId, "resume");
  if (template !== "classic" && !a.limits.premiumTemplates) throw upgradeRequired("This template is part of Premium templates & bundle.", "resume");
  if (creating && a.limits.maxResumes !== null) {
    const n = await Resume.countDocuments({ owner: userId });
    if (n >= Number(a.limits.maxResumes)) throw upgradeRequired(`The free plan saves up to ${a.limits.maxResumes} resumes. Upgrade for unlimited versions.`, "resume");
  }
}
resumeRouter.get("/", wrap(async (req, res) => {
  const [rows, access] = await Promise.all([Resume.find({ owner: req.user!._id }).sort({ updatedAt: -1 }), getAccess(req.user!._id, "resume")]);
  res.json({ items: rows.map(rv), premiumTemplates: !!access.limits.premiumTemplates, aiEnabled: llmEnabled() });
}));
resumeRouter.post("/", wrap(async (req, res) => {
  const data = parse(resumeSchema, req.body);
  await checkResumeAccess(req.user!._id, data.template, true);
  const r = await Resume.create({ owner: req.user!._id, title: data.title, template: data.template, data });
  res.status(201).json({ item: rv(r) });
}));
resumeRouter.get("/:id", wrap(async (req, res) => {
  const r = await Resume.findOne({ _id: oid(String(req.params.id)), owner: req.user!._id });
  if (!r) throw notFound("Resume not found");
  res.json({ item: rv(r) });
}));
resumeRouter.put("/:id", wrap(async (req, res) => {
  const data = parse(resumeSchema, req.body);
  await checkResumeAccess(req.user!._id, data.template, false);
  const r = await Resume.findOneAndUpdate({ _id: oid(String(req.params.id)), owner: req.user!._id }, { title: data.title, template: data.template, data }, { new: true });
  if (!r) throw notFound("Resume not found");
  res.json({ item: rv(r) });
}));
resumeRouter.post("/:id/duplicate", wrap(async (req, res) => {
  const r = await Resume.findOne({ _id: oid(String(req.params.id)), owner: req.user!._id });
  if (!r) throw notFound("Resume not found");
  await checkResumeAccess(req.user!._id, r.template ?? "classic", true);
  const c = await Resume.create({ owner: req.user!._id, title: `${r.title} (copy)`.slice(0, 80), template: r.template, data: { ...(r.data as object), title: `${r.title} (copy)`.slice(0, 80) } });
  res.status(201).json({ item: rv(c) });
}));
resumeRouter.delete("/:id", wrap(async (req, res) => {
  const r = await Resume.deleteOne({ _id: oid(String(req.params.id)), owner: req.user!._id });
  if (!r.deletedCount) throw notFound("Resume not found");
  res.json({ ok: true });
}));
resumeRouter.post("/analyze", wrap(async (req, res) => {
  const { resumeText, jobDescription } = parse(z.object({ resumeText: z.string().max(20000), jobDescription: z.string().max(8000) }), req.body);
  res.json(keywordCompare(jobDescription, resumeText));
}));

/** AI assistance. Only improves wording from facts the user supplied; output is validated and labelled. */
resumeRouter.post("/ai", wrap(async (req, res) => {
  const b = parse(z.object({
    task: z.enum(["summary", "bullets", "cover_letter"]),
    role: z.string().max(100).default(""), company: z.string().max(100).default(""),
    facts: z.string().trim().min(10, "Add a few facts about yourself first").max(3000),
    jobDescription: z.string().max(4000).default(""), name: z.string().max(80).default(""),
  }), req.body);
  const system = "You help people word their own resume. Use ONLY the facts provided by the user. Never invent employers, job titles, degrees, certifications, achievements, metrics, dates or years of experience. If the facts are thin, write less. Reply with a single JSON object and nothing else.";
  const shape = b.task === "bullets" ? '{"bullets": ["..."]}  (3 to 5 concise bullet points)' : b.task === "summary" ? '{"text": "..."}  (2-3 sentence professional summary)' : '{"text": "..."}  (a 150-220 word cover letter; sign off with the name given)';
  const user = `Task: ${b.task}\nRole: ${b.role}\nCompany: ${b.company}\nName: ${b.name}\nFacts:\n${b.facts}\nJob description (optional context):\n${b.jobDescription}\n\nReturn JSON in this shape: ${shape}`;
  const raw = await runLlm(req.user!._id, system, user, 700);
  let out: { text?: string; bullets?: string[] };
  try { out = z.object({ text: z.string().max(4000).optional(), bullets: z.array(z.string().max(300)).max(8).optional() }).parse(extractJson(raw)); }
  catch { throw new HttpError(503, "The AI returned an unusable answer. Please try again or continue manually.", "ai_invalid"); }
  const generated = out.bullets ? out.bullets.join("\n") : out.text ?? "";
  if (!generated.trim()) throw new HttpError(503, "The AI returned an empty answer. Please try again.", "ai_invalid");
  const invented = inventedNumbers(`${b.facts} ${b.role} ${b.company}`, generated);
  if (invented.length) throw new HttpError(422, `The suggestion mentioned figures that were not in your facts (${invented.join(", ")}), so it was discarded. Add the real numbers to your facts or try again.`, "ai_invented");
  res.json({ ...out, aiGenerated: true, notice: "AI-generated draft – review and edit every line so it is accurate before using it." });
}));

/* ================= Invitations ================= */
export const invitationRouter = Router();
invitationRouter.use(requireAuth);
const iv = (r: any) => ({ id: String(r._id), title: r.title, data: r.data, updatedAt: r.updatedAt });
invitationRouter.get("/", wrap(async (req, res) => {
  res.json({ items: (await InvitationDesign.find({ owner: req.user!._id }).sort({ updatedAt: -1 })).map(iv), aiEnabled: llmEnabled() });
}));
invitationRouter.post("/", wrap(async (req, res) => {
  const data = parse(invitationSchema, req.body);
  if ((await InvitationDesign.countDocuments({ owner: req.user!._id })) >= 30) throw conflict("You can save up to 30 designs. Delete one first.", "limit");
  res.status(201).json({ item: iv(await InvitationDesign.create({ owner: req.user!._id, title: data.title, data })) });
}));
invitationRouter.put("/:id", wrap(async (req, res) => {
  const data = parse(invitationSchema, req.body);
  const r = await InvitationDesign.findOneAndUpdate({ _id: oid(String(req.params.id)), owner: req.user!._id }, { title: data.title, data }, { new: true });
  if (!r) throw notFound("Design not found");
  res.json({ item: iv(r) });
}));
invitationRouter.delete("/:id", wrap(async (req, res) => {
  const r = await InvitationDesign.deleteOne({ _id: oid(String(req.params.id)), owner: req.user!._id });
  if (!r.deletedCount) throw notFound("Design not found");
  res.json({ ok: true });
}));
invitationRouter.post("/ai", wrap(async (req, res) => {
  const b = parse(z.object({ occasion: z.string().max(30), language: z.enum(["en", "or"]), names: z.string().max(100).default(""), tone: z.enum(["warm", "formal", "playful"]).default("warm"), text: z.string().max(240).default("") }), req.body);
  const system = "You write short invitation wording. Use only the names and details supplied. Do not invent dates, venues or people. Reply with a single JSON object and nothing else.";
  const lang = b.language === "or" ? "Odia (written in Odia script)" : "English";
  const user = `Write 3 short ${b.tone} invitation messages (each under 200 characters) for a ${b.occasion}${b.names ? ` for ${b.names}` : ""} in ${lang}.${b.text ? ` Base them on this wording: "${b.text}".` : ""}\nReturn: {"options": ["...","...","..."]}`;
  const raw = await runLlm(req.user!._id, system, user, 600);
  try {
    const out = z.object({ options: z.array(z.string().min(3).max(300)).min(1).max(5) }).parse(extractJson(raw));
    res.json({ options: out.options, aiGenerated: true, notice: "AI-generated wording. Verify names, dates, addresses and any translation (especially Odia) with a fluent reader before sharing." });
  } catch { throw new HttpError(503, "The AI returned an unusable answer. Please try again.", "ai_invalid"); }
}));

/* ================= Mini business page ================= */
export const pagesRouter = Router();
const publicView = (p: any) => ({ slug: p.slug, businessName: p.businessName, tagline: p.tagline, about: p.about, phone: p.phone, whatsapp: p.whatsapp, email: p.email, website: p.website, address: p.address, mapUrl: p.mapUrl, hours: p.hours, upiId: p.upiId, services: p.services, accent: p.accent, published: p.published });

/** Public, unauthenticated, only published pages. Returns JSON that the web app renders with React (auto-escaped). */
export const publicPagesRouter = Router();
publicPagesRouter.get("/pages/:slug", wrap(async (req, res) => {
  const p = await MiniBusinessPage.findOne({ slug: String(String(req.params.slug)).toLowerCase(), published: true });
  if (!p) throw notFound("This page does not exist or is not published");
  // hosting lapses with the plan: expired owners' pages stop being served
  if (Number((await getAccess(p.owner, "qr-business")).limits.hostedPages) < 1) throw notFound("This page does not exist or is not published");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ page: publicView(p) });
}));
publicPagesRouter.get("/pages-available", wrap(async (req, res) => {
  const slug = String(req.query.slug ?? "").toLowerCase();
  if (!isValidSlug(slug)) return res.json({ available: false, reason: "Use 3–40 lowercase letters, numbers and single hyphens." });
  const taken = await MiniBusinessPage.exists({ slug });
  res.json({ available: !taken, reason: taken ? "That address is taken." : "" });
}));

pagesRouter.use(requireAuth);
pagesRouter.get("/mine", wrap(async (req, res) => {
  const [p, a] = await Promise.all([MiniBusinessPage.findOne({ owner: req.user!._id }), getAccess(req.user!._id, "qr-business")]);
  res.json({ page: p ? publicView(p) : null, canPublish: Number(a.limits.hostedPages) > 0, canUsePoster: !!a.limits.poster, expiresAt: a.expiresAt });
}));
pagesRouter.put("/mine", wrap(async (req, res) => {
  const b = parse(miniPageSchema, req.body);
  if (!isValidSlug(b.slug)) throw badRequest("Page address must be 3–40 lowercase letters, numbers or single hyphens (and not a reserved word).");
  const clean: Record<string, unknown> = { ...b };
  try {
    if (b.website) clean.website = normalizeUrl(b.website);
    if (b.mapUrl) clean.mapUrl = normalizeUrl(b.mapUrl);
  } catch (e: any) { throw badRequest(e.message); }
  if (b.whatsapp) { const d = digitsOnly(b.whatsapp); if (d.length < 8 || d.length > 15) throw badRequest("WhatsApp number needs the country code, e.g. 919876543210"); clean.whatsapp = d; }
  if (b.upiId && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(b.upiId)) throw badRequest("Enter a valid UPI ID, e.g. name@bank");
  const access = await getAccess(req.user!._id, "qr-business");
  if (b.published && Number(access.limits.hostedPages) < 1) throw upgradeRequired("Publishing a hosted page needs the Hosted business page plan. You can still preview it for free.", "qr-business");
  const existing = await MiniBusinessPage.findOne({ owner: req.user!._id });
  try {
    const doc = await MiniBusinessPage.findOneAndUpdate(
      { owner: req.user!._id }, { ...clean, owner: req.user!._id, publishedAt: b.published ? (existing?.publishedAt ?? new Date()) : null },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ page: publicView(doc) });
  } catch (e: any) { if (e?.code === 11000) throw conflict("That page address is already taken", "slug_taken"); throw e; }
}));
pagesRouter.delete("/mine", wrap(async (req, res) => {
  await MiniBusinessPage.deleteOne({ owner: req.user!._id });
  res.json({ ok: true });
}));
