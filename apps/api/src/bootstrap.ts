import { hash } from "@node-rs/argon2";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { User } from "./models/index.js";

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD (idempotent; never overwrites an existing user's password). */
export async function ensureAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) { if (existing.role !== "admin") { existing.role = "admin"; await existing.save(); } return; }
  await User.create({ email, name: "Administrator", passwordHash: await hash(env.ADMIN_PASSWORD), role: "admin", emailVerified: true });
  logger.info({ email }, "admin account created");
}
