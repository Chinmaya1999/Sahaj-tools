import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { env, isProd, isTest } from "./env.js";
import { BRAND, SEO_PUBLIC_PATHS, renderSeoHead, seoFor } from "@ek/shared";
import { HttpError, notFound, zodToHttp } from "./lib/http.js";
import { loadUser } from "./lib/auth.js";
import { logger } from "./lib/logger.js";
import { accountRouter, supportRouter } from "./routes/account.js";
import { adminRouter, recordError } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter, catalogRouter, entitlementRouter, webhookHandler } from "./routes/billing.js";
import { downloadsRouter } from "./routes/downloads.js";
import { inventoryRouter } from "./routes/inventory.js";
import { invoiceRouter } from "./routes/invoices.js";
import { ministockRouter } from "./routes/ministock.js";
import { invitationRouter, pagesRouter, publicPagesRouter, resumeRouter } from "./routes/products.js";
import mongoose from "mongoose";

export interface AppOptions { rateLimits?: boolean; authMax?: number }

export function createApp(opts: AppOptions = {}) {
  const app = express();
  const limitsOn = opts.rateLimits ?? !isTest;
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (r) => r.url === "/api/health" } }));

  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      scriptSrc: ["'self'", "https://checkout.razorpay.com", "https://*.cashfree.com"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"], imgSrc: ["'self'", "data:", "blob:", "https://*.cashfree.com", "https://*.razorpay.com"],
      connectSrc: ["'self'", "https://lumberjack.razorpay.com", "https://api.razorpay.com", "https://*.cashfree.com"], frameSrc: ["https://api.razorpay.com", "https://checkout.razorpay.com", "https://*.cashfree.com"],
      workerSrc: ["'self'", "blob:"],
      // Cashfree's checkout posts a form to api/sandbox.cashfree.com; without this the payment window cannot open.
      formAction: ["'self'", "https://*.cashfree.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
    } },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: [env.WEB_ORIGIN], credentials: true }));

  // Webhook needs the raw body for signature verification, so it is mounted before the JSON parser.
  app.post("/api/webhooks/payments", ...webhookHandler);

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  const limiter = (windowMs: number, max: number, message: string) => limitsOn
    ? rateLimit({ windowMs, limit: max, standardHeaders: "draft-7", legacyHeaders: false, message: { error: message, code: "rate_limited" } })
    : (_q: any, _r: any, n: any) => n();

  app.get("/api/health", (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  app.use("/api", limiter(60_000, 600, "Too many requests, slow down."));

  // CSRF defence for cookie auth: SameSite=Lax cookie + custom header + Origin allowlist on state-changing requests.
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && origin !== env.WEB_ORIGIN && !(origin === `${req.protocol}://${req.get("host")}`)) return next(new HttpError(403, "Cross-origin request blocked", "csrf"));
    if (req.get("x-requested-with") !== "ek") return next(new HttpError(403, "Missing request header", "csrf"));
    next();
  });
  app.use("/api", loadUser);

  app.use("/api/auth/login", limiter(15 * 60_000, opts.authMax ?? 20, "Too many sign-in attempts. Try again in a few minutes."));
  app.use("/api/auth/register", limiter(60 * 60_000, Number(process.env.SIGNUP_LIMIT_PER_HOUR) || 20, "Too many sign-ups from this network. Try again later."));
  app.use("/api/auth/forgot", limiter(60 * 60_000, 10, "Too many reset requests. Try again later."));
  app.use("/api/support", limiter(60 * 60_000, 10, "Too many messages. Try again later."));
  app.use(["/api/resumes/ai", "/api/invitations/ai"], limiter(60 * 60_000, 40, "Too many AI requests. Try again later."));

  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/entitlements", entitlementRouter);
  app.use("/api/downloads", downloadsRouter);
  app.use("/api/invoices", invoiceRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/ministock", ministockRouter);
  app.use("/api/resumes", resumeRouter);
  app.use("/api/invitations", invitationRouter);
  app.use("/api/pages", pagesRouter);
  app.use("/api/public", publicPagesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", (_req, _res, next) => next(notFound("Unknown API route")));

  // Serve the built web app (single-origin deployment) when present.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (fs.existsSync(webDist)) {
    // Express skips dot-folders by default; /.well-known must be served (Android app links verification).
    app.use("/.well-known", express.static(path.join(webDist, ".well-known"), { dotfiles: "allow", maxAge: "1h", index: false }));
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    const indexHtml = fs.readFileSync(path.join(webDist, "index.html"), "utf8");
    const origin = env.WEB_ORIGIN.replace(/\/+$/, "");
    app.get("/robots.txt", (_req, res) => {
      res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /admin\nDisallow: /checkout\n\nSitemap: ${origin}/sitemap.xml\n`);
    });
    app.get("/sitemap.xml", (_req, res) => {
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = SEO_PUBLIC_PATHS.map((p) => `  <url><loc>${origin}${p === "/" ? "" : p}</loc><lastmod>${lastmod}</lastmod><changefreq>${p === "/" ? "daily" : "weekly"}</changefreq><priority>${p === "/" ? "1.0" : p.startsWith("/tools/") && !p.endsWith("/about") ? "0.9" : "0.6"}</priority></url>`).join("\n");
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    });
    // Inject per-page SEO tags into the HTML so crawlers and link previews see them without running JavaScript.
    app.get(/^(?!\/api).*/, (req, res) => {
      const known = seoFor(req.path).title !== `Page not found | ${BRAND.name}`;
      res.status(known ? 200 : 404).type("html").send(indexHtml.replace("<!--seo-->", () => renderSeoHead(req.path, origin)));
    });
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    let e: HttpError;
    if (err instanceof HttpError) e = err;
    else if (err instanceof ZodError) e = zodToHttp(err);
    else if (err?.type === "entity.too.large") e = new HttpError(413, "That request is too large", "too_large");
    else if (err?.type === "entity.parse.failed") e = new HttpError(400, "Malformed JSON", "bad_json");
    else if (err?.code === 11000) e = new HttpError(409, "That already exists", "duplicate");
    else if (err?.name === "CastError") e = new HttpError(404, "Not found", "not_found");
    else {
      e = new HttpError(500, "Something went wrong on our side. Please try again.", "internal");
      logger.error({ err, url: req.url }, "unhandled error");
      recordError(String(err?.message ?? err)); if (isTest) console.error(err);
    }
    res.status(e.status).json({ error: e.message, code: e.code, ...(e.extra ?? {}) });
  };
  app.use(onError);
  void isProd;
  return app;
}
