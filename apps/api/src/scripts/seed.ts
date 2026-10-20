import { hash } from "@node-rs/argon2";
import { connectDb, disconnectDb } from "../db.js";
import { ensureAdmin } from "../bootstrap.js";
import { env } from "../env.js";
import { User } from "../models/index.js";

// npm run seed                      -> make sure the admin from ADMIN_EMAIL exists (never overwrites a password)
// npm run seed -- --reset-password  -> set the admin's password to ADMIN_PASSWORD (use after changing it in .env)
await connectDb();
await ensureAdmin();
if (process.argv.includes("--reset-password")) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD first");
  const r = await User.updateOne({ email: env.ADMIN_EMAIL.toLowerCase(), role: "admin" }, { passwordHash: await hash(env.ADMIN_PASSWORD) });
  console.log(r.matchedCount ? "Admin password updated." : "No admin with that email was found.");
} else console.log("Seed complete: admin account ensured.");
await disconnectDb();
