import { env } from "../../env.js";
import type { PaymentProvider } from "./provider.js";
import { cashfreeProvider } from "./cashfree.js";
import { razorpayProvider } from "./razorpay.js";
import { sandboxProvider } from "./sandbox.js";

export const getProvider = (): PaymentProvider =>
  env.PAYMENT_PROVIDER === "razorpay" ? razorpayProvider : env.PAYMENT_PROVIDER === "cashfree" ? cashfreeProvider : sandboxProvider;
export type { PaymentProvider };
