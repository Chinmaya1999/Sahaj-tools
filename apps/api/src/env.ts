import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env"), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  DOWNLOAD_SECRET: z.string().min(32, "DOWNLOAD_SECRET must be at least 32 chars"),
  SESSION_DAYS: z.coerce.number().default(14),
  PAYMENT_PROVIDER: z.enum(["sandbox", "razorpay", "cashfree"]).default("sandbox"),
  SANDBOX_PAYMENT_SECRET: z.string().default("dev-only-sandbox-payment-secret-0123456789"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  LLM_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-haiku-5-5"),
  AI_DAILY_USER_LIMIT: z.coerce.number().default(15),
  AI_DAILY_GLOBAL_LIMIT: z.coerce.number().default(300),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Sahaj <no-reply@everydaykit.example>"),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  DOWNLOAD_LINK_SECONDS: z.coerce.number().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:\n", parsed.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

if (isProd && env.PAYMENT_PROVIDER === "sandbox") {
  console.error("Refusing to start: PAYMENT_PROVIDER=sandbox is not allowed in production.");
  process.exit(1);
}
