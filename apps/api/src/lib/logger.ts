import pino from "pino";
import { env, isTest } from "../env.js";

/** Structured logs. Sensitive fields are redacted – never log payment secrets, passwords or cookies. */
export const logger = pino({
  level: isTest ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  redact: { paths: ["req.headers.cookie", "req.headers.authorization", "*.password", "*.passwordHash", "*.signature", "*.token"], censor: "[redacted]" },
});
