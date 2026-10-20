import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error", public extra?: Record<string, unknown>) { super(message); }
}
export const badRequest = (m: string, extra?: Record<string, unknown>) => new HttpError(400, m, "bad_request", extra);
export const unauthorized = (m = "Please sign in") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "You do not have access to this") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found") => new HttpError(404, m, "not_found");
export const conflict = (m: string, code = "conflict") => new HttpError(409, m, code);
export const upgradeRequired = (m: string, product: string) => new HttpError(402, m, "upgrade_required", { product });

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToHttp(r.error);
  return r.data;
}
export function zodToHttp(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of e.issues) { const k = i.path.join(".") || "_"; if (!fields[k]) fields[k] = i.message; }
  const first = e.issues[0];
  return new HttpError(422, first ? `${first.path.join(".") ? first.path.join(".") + ": " : ""}${first.message}` : "Invalid input", "validation", { fields });
}
