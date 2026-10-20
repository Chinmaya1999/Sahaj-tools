/**
 * Central product + pricing configuration. The server is the single source of
 * truth for what a plan costs; the browser only displays this data.
 * Every price here is a "pricing experiment" – see docs/pricing.md.
 */
export const BRAND = {
  name: "Oqzra",
  tagline: "Simple tools for everyday life.",
  supportEmail: "support@sahaj.example",
};

export type ProductSlug = "invoice" | "resume" | "inventory" | "invitation" | "pdf-tools" | "qr-business" | "photo-tools";

export interface ProductInfo {
  slug: ProductSlug;
  name: string;
  short: string;
  problem: string;
  audience: string;
  features: string[];
  free: string;
  delivery: "Online in your browser" | "Online + downloadable templates";
  requirements: string;
  processing: "browser" | "server";
  icon: string;
  accent: string;
}

export const PRODUCTS: ProductInfo[] = [
  {
    slug: "invoice", name: "Invoice & Quotation Generator", short: "Professional bills in minutes",
    problem: "Create clean invoices and quotations without spreadsheets, with correct totals and tracked payments.",
    audience: "Freelancers, repair workers, small shops, home businesses",
    features: ["Invoices & quotations with revisions", "Server-verified totals and tax", "Configurable tax rates per line", "PDF download, print, CSV export", "Payment status & due dates", "WhatsApp share link"],
    free: "2 documents per month", delivery: "Online in your browser", requirements: "Any modern browser", processing: "server", icon: "🧾", accent: "#4f46e5",
  },
  {
    slug: "resume", name: "Resume & Job Application Builder", short: "ATS-friendly resumes",
    problem: "Build a clear, well-structured resume and cover letter and check it against a job description.",
    audience: "Students, freshers, job seekers, professionals",
    features: ["Guided builder with live preview", "ATS-friendly templates", "Keyword match against a job description", "Cover letter generator", "Multiple saved versions", "Optional AI wording help (reviewed by you)"],
    free: "1 standard template, 2 saved resumes", delivery: "Online in your browser", requirements: "Any modern browser", processing: "server", icon: "📄", accent: "#0f766e",
  },
  {
    slug: "inventory", name: "Inventory & Expiry Manager", short: "Know what is in stock",
    problem: "Track stock movements, low stock and expiry dates instead of overwriting numbers in a notebook.",
    audience: "Small shops, cosmetics, clothing and gift sellers",
    features: ["Stock-in / out, sales, returns, damage", "Full movement audit trail", "Low-stock and expiry lists", "CSV import with column mapping", "Moving-average valuation", "Mobile-friendly stock updates"],
    free: "Up to 25 products", delivery: "Online + downloadable templates", requirements: "Any modern browser; CSV template for import", processing: "server", icon: "📦", accent: "#b45309",
  },
  {
    slug: "invitation", name: "Regional-Language Invitation Maker", short: "Invitations in English & Odia",
    problem: "Design birthday, wedding and festival invitations with proper Unicode text, then export as image or PDF.",
    audience: "Families, event organisers, small businesses",
    features: ["Six event templates", "English and Odia text rendering", "Custom colours, layouts, backgrounds", "PNG and PDF export with resolution info", "Optional AI wording (you edit it)", "Mobile-friendly editor"],
    free: "Watermarked previews & downloads", delivery: "Online in your browser", requirements: "Any modern browser", processing: "browser", icon: "💌", accent: "#be185d",
  },
  {
    slug: "pdf-tools", name: "PDF & Document Utility", short: "Merge, split, rotate, compress",
    problem: "Combine, split, reorder, rotate and convert PDFs and images without uploading your files anywhere.",
    audience: "Students, office workers, freelancers, applicants",
    features: ["Merge, split, reorder, rotate", "Images to PDF", "Extract pages", "Runs in your browser – files are not uploaded", "Drag and drop, progress and cancel", "Batch on paid plan"],
    free: "Basic processing, up to 25 MB per file", delivery: "Online in your browser", requirements: "Modern browser (Chrome, Edge, Firefox, Safari)", processing: "browser", icon: "🗂️", accent: "#1d4ed8",
  },
  {
    slug: "qr-business", name: "QR Code & Mini-Business Page", short: "QR codes and a tiny website",
    problem: "Make QR codes for links, contacts, WhatsApp and UPI details, and publish a simple mobile page for your business.",
    audience: "Tutors, salons, food sellers, repair workers, local services",
    features: ["URL, contact, WhatsApp and UPI QR codes", "PNG and SVG download", "Hosted mini-business page", "Print-ready poster", "Validated, sanitised content", "Scan-testing guidance"],
    free: "Unlimited basic QR codes and page preview", delivery: "Online in your browser", requirements: "Any modern browser", processing: "server", icon: "🔳", accent: "#7c3aed",
  },
  {
    slug: "photo-tools", name: "Photo Resize & Application Helper", short: "Right size, right weight",
    problem: "Resize and compress photos and signatures to the pixel and file-size limits an application form asks for.",
    audience: "Students, job seekers, applicants",
    features: ["Custom width, height, max file size", "Labelled, editable presets", "Crop or keep aspect ratio", "Format conversion", "Batch with ZIP download", "Runs in your browser – photos are not uploaded"],
    free: "Single-image resizing", delivery: "Online in your browser", requirements: "Any modern browser", processing: "browser", icon: "🖼️", accent: "#0369a1",
  },
];

export type PlanKind = "free" | "credits" | "period" | "one_time";
export interface Plan {
  id: string;
  product: ProductSlug;
  name: string;
  kind: PlanKind;
  pricePaise: number;
  credits?: number; // for kind=credits
  periodDays?: number; // for kind=period
  blurb: string;
  billing: string; // human readable billing note
  limits: Record<string, number | boolean | null>; // null = unlimited
  asset?: string; // downloadable asset id included
}

export const PLANS: Plan[] = [
  { id: "invoice-free", product: "invoice", name: "Free", kind: "free", pricePaise: 0, blurb: "2 documents per calendar month, Classic template.", billing: "Free", limits: { docsPerMonth: 2, premiumTemplates: false, removeBranding: false } },
  { id: "invoice-starter", product: "invoice", name: "Starter pack", kind: "credits", pricePaise: 2900, credits: 10, blurb: "10 extra documents plus Modern and Minimal templates. Credits do not expire.", billing: "One-time payment", limits: { docsPerMonth: 2, premiumTemplates: true, removeBranding: false } },
  { id: "invoice-pro", product: "invoice", name: "Pro", kind: "period", pricePaise: 9900, periodDays: 30, blurb: "Unlimited documents, all templates and no Oqzra footer on your PDFs, for 30 days.", billing: "Per 30 days, no automatic renewal", limits: { docsPerMonth: null, premiumTemplates: true, removeBranding: true } },

  { id: "resume-free", product: "resume", name: "Free", kind: "free", pricePaise: 0, blurb: "Standard template, 2 saved resumes.", billing: "Free", limits: { maxResumes: 2, premiumTemplates: false } },
  { id: "resume-premium", product: "resume", name: "Premium templates & bundle", kind: "one_time", pricePaise: 7900, blurb: "All templates, unlimited versions, application package export.", billing: "One-time payment", limits: { maxResumes: null, premiumTemplates: true } },

  { id: "inventory-free", product: "inventory", name: "Free", kind: "free", pricePaise: 0, blurb: "Up to 25 products, dashboard, low-stock and expiry lists.", billing: "Free", limits: { maxItems: 25, reports: false } },
  { id: "inventory-pro", product: "inventory", name: "Pro", kind: "period", pricePaise: 9900, periodDays: 30, blurb: "Up to 500 products, sales & profit reports, Starter Kit download.", billing: "Per 30 days, no automatic renewal", limits: { maxItems: 500, reports: true }, asset: "inventory-starter-kit" },
  { id: "inventory-business", product: "inventory", name: "Business", kind: "period", pricePaise: 29900, periodDays: 30, blurb: "Up to 5,000 products, sales & profit reports, Starter Kit download.", billing: "Per 30 days, no automatic renewal", limits: { maxItems: 5000, reports: true }, asset: "inventory-starter-kit" },

  { id: "invitation-free", product: "invitation", name: "Free", kind: "free", pricePaise: 0, blurb: "Watermarked downloads.", billing: "Free", limits: { clean: false } },
  { id: "invitation-pack", product: "invitation", name: "Clean download pack", kind: "credits", pricePaise: 4900, credits: 5, blurb: "5 downloads without watermark.", billing: "One-time payment", limits: { clean: false } },

  { id: "pdf-free", product: "pdf-tools", name: "Free", kind: "free", pricePaise: 0, blurb: "Up to 25 MB per file, 1 operation at a time.", billing: "Free", limits: { maxFileMb: 25, maxFiles: 10 } },
  { id: "pdf-batch", product: "pdf-tools", name: "Batch & large files", kind: "period", pricePaise: 2900, periodDays: 30, blurb: "Up to 100 MB per file and 50 files per job for 30 days.", billing: "Per 30 days, no automatic renewal", limits: { maxFileMb: 100, maxFiles: 50 } },

  { id: "qr-free", product: "qr-business", name: "Free", kind: "free", pricePaise: 0, blurb: "Unlimited QR codes, page preview.", billing: "Free", limits: { hostedPages: 0, poster: false } },
  { id: "qr-page-year", product: "qr-business", name: "Hosted business page", kind: "period", pricePaise: 19900, periodDays: 365, blurb: "One published page for 1 year.", billing: "Per year, no automatic renewal", limits: { hostedPages: 1, poster: true } },
  { id: "qr-poster", product: "qr-business", name: "Premium poster design", kind: "one_time", pricePaise: 4900, blurb: "Print-ready poster templates.", billing: "One-time payment", limits: { hostedPages: 0, poster: true } },

  { id: "photo-free", product: "photo-tools", name: "Free", kind: "free", pricePaise: 0, blurb: "Single image at a time.", billing: "Free", limits: { maxFiles: 1 } },
  { id: "photo-batch", product: "photo-tools", name: "Batch processing", kind: "period", pricePaise: 2900, periodDays: 30, blurb: "Up to 50 images per batch for 30 days.", billing: "Per 30 days, no automatic renewal", limits: { maxFiles: 50 } },
];

export interface Bundle {
  id: string;
  name: string;
  blurb: string;
  pricePaise: number;
  planIds: string[];
}
export const BUNDLES: Bundle[] = [
  { id: "bundle-student", name: "Student bundle", blurb: "Resume premium + 30 days of batch PDF and photo tools.", pricePaise: 9900, planIds: ["resume-premium", "pdf-batch", "photo-batch"] },
  { id: "bundle-shop", name: "Small shop bundle", blurb: "30 days of Invoice Pro and Inventory Pro.", pricePaise: 14900, planIds: ["invoice-pro", "inventory-pro"] },
];

export interface DownloadableAssetInfo {
  id: string;
  name: string;
  description: string;
  filename: string;
  product: ProductSlug;
  requiresPlan: string[]; // any of these plans (or bundles including them) grants access
}
export const ASSETS: DownloadableAssetInfo[] = [
  {
    id: "inventory-starter-kit", name: "Inventory Starter Kit", product: "inventory", filename: "inventory-starter-kit.zip",
    description: "CSV import templates for general, cosmetics and clothing stock, plus step-by-step instructions.",
    requiresPlan: ["inventory-pro", "inventory-business"],
  },
];

export const planById = (id: string) => PLANS.find((p) => p.id === id);
export const bundleById = (id: string) => BUNDLES.find((b) => b.id === id);
export const productBySlug = (s: string) => PRODUCTS.find((p) => p.slug === s);
export const freePlanFor = (slug: ProductSlug) => PLANS.find((p) => p.product === slug && p.kind === "free")!;
