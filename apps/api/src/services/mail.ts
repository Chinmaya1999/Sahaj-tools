import nodemailer from "nodemailer";
import { env, isProd } from "../env.js";
import { logger } from "../lib/logger.js";

/** Captured outgoing mail when no SMTP is configured (never in production). Used by tests/dev. */
export const devMailbox: { to: string; subject: string; text: string }[] = [];
const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (transport) { await transport.sendMail({ from: env.MAIL_FROM, to, subject, text }); return; }
  if (isProd) { logger.error({ subject }, "SMTP_URL not configured – email not sent"); return; }
  devMailbox.push({ to, subject, text });
  logger.info({ to, subject }, "dev mail captured (no SMTP configured)");
  if (env.NODE_ENV === "development") console.log(`\n[dev mail] to=${to}\n${subject}\n${text}\n`);
}
