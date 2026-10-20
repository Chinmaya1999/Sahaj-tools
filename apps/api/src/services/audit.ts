import type { Request } from "express";
import type { Types } from "mongoose";
import { AuditLog } from "../models/index.js";
import { logger } from "../lib/logger.js";

export async function audit(req: Request | null, action: string, target?: string, meta?: Record<string, unknown>, actor?: Types.ObjectId | null) {
  try {
    await AuditLog.create({ actor: actor ?? req?.user?._id ?? null, action, target, meta, ip: req?.ip });
  } catch (e) { logger.error({ err: e, action }, "audit write failed"); }
}
