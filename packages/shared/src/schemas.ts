import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const registerSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(80), email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().default("");

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(120),
  address: optText(300), phone: optText(30),
  email: z.union([emailSchema, z.literal("")]).optional().default(""),
  taxId: optText(40), taxLabel: optText(20).default("GSTIN"),
  logoDataUrl: z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG, JPEG or WebP image").optional().or(z.literal("")),
  invoicePrefix: z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, "1–10 letters, digits or hyphens").default("INV"),
  quotePrefix: z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, "1–10 letters, digits or hyphens").default("QT"),
  defaultTaxPercent: z.number().min(0).max(100).default(0),
  defaultNotes: optText(500),
});

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Description required").max(300),
  quantity: z.number().positive("Quantity must be above 0").max(1_000_000).refine((n) => Math.round(n * 1000) / 1000 === n, "Max 3 decimals"),
  ratePaise: z.number().int("Rate must be whole paise").min(0).max(10_000_000_00),
  taxPercent: z.number().min(0).max(100).refine((n) => Math.round(n * 100) / 100 === n, "Max 2 decimals"),
});
export const invoiceInputSchema = z.object({
  kind: z.enum(["invoice", "quotation"]),
  customer: z.object({ name: z.string().trim().min(1, "Customer name required").max(120), phone: optText(30), email: z.union([emailSchema, z.literal("")]).optional().default(""), address: optText(300), taxId: optText(40) }),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().nullable().optional(),
  lines: z.array(lineItemSchema).min(1, "Add at least one line").max(100),
  discount: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("percent"), value: z.number().min(0).max(100) }),
    z.object({ type: z.literal("amount"), valuePaise: z.number().int().min(0) }),
  ]).default({ type: "none" }),
  paidPaise: z.number().int().min(0).default(0),
  notes: optText(1000),
  template: z.enum(["classic", "modern", "minimal"]).default("classic"),
  issue: z.boolean().default(true),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sku: z.string().trim().min(1, "SKU is required").max(60).regex(/^[A-Za-z0-9._\/-]+$/, "Letters, digits and . _ / - only"),
  barcode: optText(40), category: optText(60), supplier: optText(80),
  pricePaise: z.number().int().min(0).max(100_000_000_00),
  costPaise: z.number().int().min(0).max(100_000_000_00),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  expiryDate: z.coerce.date().nullable().optional(),
  size: optText(20), colour: optText(30), variant: optText(40),
  openingQty: z.number().int().min(0).max(10_000_000).default(0),
});
export type ItemInput = z.infer<typeof itemInputSchema>;
export const MOVEMENT_TYPES = ["stock_in", "stock_out", "sale", "return", "damage", "adjustment"] as const;
export const movementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10_000_000),
  note: optText(200),
  unitCostPaise: z.number().int().min(0).optional(),
  /** For adjustments: direction of the correction. */
  direction: z.enum(["increase", "decrease"]).optional(),
});

const rSection = <T extends z.ZodTypeAny>(s: T) => z.array(s).max(30).default([]);
export const resumeSchema = z.object({
  title: z.string().trim().min(1).max(80).default("My resume"),
  template: z.enum(["classic", "modern", "compact"]).default("classic"),
  personal: z.object({ fullName: optText(80), headline: optText(100), email: optText(120), phone: optText(30), location: optText(80), links: optText(300) }).default({ fullName: "", headline: "", email: "", phone: "", location: "", links: "" }),
  summary: optText(1200),
  experience: rSection(z.object({ role: optText(100), company: optText(100), start: optText(20), end: optText(20), bullets: z.array(text(300)).max(12).default([]) })),
  education: rSection(z.object({ degree: optText(120), school: optText(120), start: optText(20), end: optText(20), detail: optText(200) })),
  skills: z.array(text(40)).max(60).default([]),
  projects: rSection(z.object({ name: optText(100), link: optText(200), description: optText(500) })),
  certifications: rSection(z.object({ name: optText(120), issuer: optText(100), year: optText(10) })),
  languages: z.array(text(40)).max(15).default([]),
  coverLetter: optText(4000),
  jobDescription: optText(8000),
});
export type ResumeInput = z.infer<typeof resumeSchema>;

export const invitationSchema = z.object({
  title: z.string().trim().min(1).max(80).default("My invitation"),
  occasion: z.enum(["birthday", "wedding", "anniversary", "housewarming", "festival", "event"]),
  language: z.enum(["en", "or"]).default("en"),
  layout: z.enum(["centered", "left", "frame"]).default("centered"),
  fields: z.object({ heading: optText(80), names: optText(100), date: optText(40), time: optText(30), venue: optText(160), contact: optText(80), message: optText(240) }),
  colours: z.object({ background: z.string().regex(/^#[0-9a-fA-F]{6}$/), text: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
});
export type InvitationInput = z.infer<typeof invitationSchema>;

export const miniPageSchema = z.object({
  slug: z.string().trim().toLowerCase(),
  businessName: z.string().trim().min(1, "Business name required").max(80),
  tagline: optText(120), about: optText(600),
  phone: optText(30), whatsapp: optText(20), email: z.union([emailSchema, z.literal("")]).optional().default(""),
  website: optText(200), address: optText(200), mapUrl: optText(300),
  hours: optText(200), upiId: optText(80),
  services: z.array(z.object({ name: text(80), price: optText(30), description: optText(200) })).max(20).default([]),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4f46e5"),
  published: z.boolean().default(false),
});
export type MiniPageInput = z.infer<typeof miniPageSchema>;

export const supportSchema = z.object({ name: z.string().trim().min(1).max(80), email: emailSchema, subject: z.string().trim().min(3).max(120), message: z.string().trim().min(10, "Please add a little more detail").max(3000), orderId: z.string().trim().max(40).optional() });

export const checkoutSchema = z.object({ itemType: z.enum(["plan", "bundle"]), itemId: z.string().min(1).max(60), code: z.string().trim().max(30).optional() });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
