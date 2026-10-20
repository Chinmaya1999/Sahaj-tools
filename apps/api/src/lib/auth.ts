import type { NextFunction, Request, Response } from "express";
import type { Types } from "mongoose";
import { env, isProd } from "../env.js";
import { Session, User } from "../models/index.js";
import { forbidden, unauthorized, wrap } from "./http.js";
import { randomToken, sha256 } from "./security.js";

export const COOKIE = "ek_sid";
export interface AuthUser { id: string; _id: Types.ObjectId; email: string; name: string; role: "customer" | "admin" }
declare module "express-serve-static-core" { interface Request { user?: AuthUser } }

export async function createSession(res: Response, userId: Types.ObjectId, userAgent?: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 86400_000);
  await Session.create({ tokenHash: sha256(token), user: userId, expiresAt, userAgent: userAgent?.slice(0, 200) });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProd, path: "/", expires: expiresAt });
}
export const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE, { path: "/" });

/** Attaches req.user when a valid session cookie is present. */
export const loadUser = wrap(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (typeof token === "string" && token.length < 100) {
    const s = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
    if (s) {
      const u = await User.findById(s.user);
      if (u && !u.disabled) req.user = { id: u.id, _id: u._id, email: u.email, name: u.name, role: u.role };
    }
  }
  next();
});
export const requireAuth = (req: Request, _res: Response, next: NextFunction) => (req.user ? next() : next(unauthorized()));
export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(forbidden("Administrator access required"));
  next();
};
