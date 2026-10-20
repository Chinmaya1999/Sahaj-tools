export type WebhookEventType = "payment.captured" | "payment.failed" | "refund.processed" | "payment.disputed";
export interface ParsedWebhook {
  eventId: string;
  type: WebhookEventType;
  providerOrderId: string;
  paymentId: string;
  amountPaise: number;
}
export interface CreatedProviderOrder { providerOrderId: string; checkout: Record<string, unknown> }

/** Contract every payment gateway adapter implements. Business logic only talks to this. */
export interface PaymentProvider {
  readonly name: "sandbox" | "razorpay" | "cashfree";
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string>; customer?: { id: string; name: string; email: string } }): Promise<CreatedProviderOrder>;
  /** Verifies the signature returned to the browser after checkout. */
  verifyCheckoutSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  /** Optionally confirm payment details directly with the provider (server-to-server). */
  fetchPayment?(paymentId: string): Promise<{ orderId: string; amountPaise: number; captured: boolean } | null>;
  /** Gateways without a browser-side signature (Cashfree): look up the successful payment for an order server-to-server. */
  fetchSuccessfulPayment?(providerOrderId: string): Promise<{ paymentId: string; amountPaise: number } | null>;
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: any, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null;
  refund(input: { paymentId: string; amountPaise: number }): Promise<{ refundId: string }>;
}
