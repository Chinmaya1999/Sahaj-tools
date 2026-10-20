import { BRAND, PRODUCTS, type ProductSlug } from "./catalog";

/**
 * Search-engine metadata for every public page. Used by the API (injected into the HTML so crawlers
 * and link previews see it without running JavaScript) and by the web app (kept in sync on navigation).
 */
export interface SeoMeta {
  title: string;
  description: string;
  keywords: string[];
  noindex?: boolean;
  /** JSON-LD objects, emitted as <script type="application/ld+json">. Paths in them are relative to the site origin. */
  jsonLd?: Record<string, unknown>[];
}

const SITE = BRAND.name;
export const SEO_DEFAULT_IMAGE = "/icon-512.png";

const PRODUCT_SEO: Record<ProductSlug, { title: string; description: string; keywords: string[] }> = {
  invoice: {
    title: "Free Invoice Generator & Quotation Maker Online (GST-ready)",
    description: "Create professional invoices and quotations online in minutes. Automatic totals and tax, PDF download, payment tracking and WhatsApp sharing. Free for freelancers and small shops.",
    keywords: ["invoice generator", "free invoice maker", "GST invoice generator", "quotation maker", "online billing software", "bill maker for small business", "invoice template PDF", "freelancer invoice"],
  },
  resume: {
    title: "Free ATS-Friendly Resume Builder & Cover Letter Maker",
    description: "Build a clean, ATS-friendly resume with live preview, match it against a job description and generate a cover letter. Made for students, freshers and job seekers.",
    keywords: ["resume builder", "free resume maker", "ATS resume", "CV maker online", "cover letter generator", "resume for freshers", "resume keyword checker", "job application builder"],
  },
  inventory: {
    title: "Inventory & Expiry Manager for Small Shops – Stock Tracker",
    description: "Track stock in and out, low stock and expiry dates, import from CSV and see stock value. Simple inventory management software for small shops and home businesses.",
    keywords: ["inventory management software", "stock management for small shop", "expiry date tracker", "low stock alert", "free inventory app", "stock register online", "shop inventory software"],
  },
  invitation: {
    title: "Invitation Card Maker in English & Odia – Birthday, Wedding, Festival",
    description: "Design birthday, wedding and festival invitation cards with correct English and Odia text. Download as PNG or PDF. Works on mobile.",
    keywords: ["invitation card maker", "Odia invitation card", "wedding card maker online", "birthday invitation maker", "Odia language card design", "festival invitation", "e-invitation maker free"],
  },
  "pdf-tools": {
    title: "Free PDF Tools Online – Merge, Split, Rotate & Images to PDF (No Upload)",
    description: "Merge, split, reorder, rotate PDFs and convert images to PDF right in your browser. Your files are never uploaded. Free and fast.",
    keywords: ["merge PDF online free", "split PDF", "rotate PDF", "image to PDF", "JPG to PDF", "PDF tools without upload", "combine PDF files", "extract PDF pages"],
  },
  "qr-business": {
    title: "Free QR Code Generator (UPI, WhatsApp, URL) & Mini Business Page",
    description: "Generate QR codes for links, contacts, WhatsApp and UPI payments, download PNG or SVG, and publish a simple mobile page for your business.",
    keywords: ["QR code generator", "UPI QR code generator", "WhatsApp QR code", "free QR code maker", "business QR code", "mini website for small business", "QR code poster", "vCard QR code"],
  },
  "photo-tools": {
    title: "Photo Resizer for Application Forms – Resize Photo & Signature to 20KB, 50KB",
    description: "Resize and compress photos and signatures to the exact pixel size and KB limit that exam and job application forms ask for. Runs in your browser; nothing is uploaded.",
    keywords: ["photo resizer", "resize photo to 20kb", "resize image to 50kb", "signature resize online", "passport size photo resize", "image compressor", "photo resize for application form", "reduce image size in kb"],
  },
};

const ALL_TOOL_KEYWORDS = [SITE, "online tools", "small business tools", "free online tools India"];

const STATIC_SEO: Record<string, SeoMeta> = {
  "/": {
    title: `${SITE} – Free Invoice, Resume, PDF, QR Code & Photo Resize Tools`,
    description: "Seven small, affordable online tools: invoice & quotation generator, ATS resume builder, inventory manager, Odia invitation maker, PDF tools, QR codes and photo resizer. Free to start, no auto-renewal.",
    keywords: ["invoice generator", "resume builder", "PDF tools", "QR code generator", "photo resizer", "inventory manager", "invitation maker", "free online tools", ...ALL_TOOL_KEYWORDS],
  },
  "/explore": {
    title: `All Tools – Invoice, Resume, Inventory, PDF, QR, Photo | ${SITE}`,
    description: "Browse every Sahaj tool: invoices, resumes, inventory, invitations, PDF utilities, QR codes and photo resizing. Pick one and start free.",
    keywords: ["online tools", "business tools", "document tools", "student tools", ...ALL_TOOL_KEYWORDS],
  },
  "/free-tools": {
    title: `Free Online Tools – No Signup Needed to Try | ${SITE}`,
    description: "Try Sahaj's free tools: merge PDFs, resize photos, make QR codes, build a resume and more. Free plan on every tool.",
    keywords: ["free online tools", "free PDF tools", "free QR generator", "free photo resizer", "free resume builder"],
  },
  "/pricing": {
    title: `Pricing – Pay Once or Per 30 Days, No Auto-Renewal | ${SITE}`,
    description: "Simple, affordable pricing from ₹29. Every tool has a free plan; paid plans are one-time or per 30 days and never renew automatically.",
    keywords: ["affordable invoice software price", "cheap online tools India", "pay as you go tools", "no subscription tools"],
  },
  "/bundles": {
    title: `Bundles – Student & Small Shop Packs | ${SITE}`,
    description: "Save with the Student bundle (resume, PDF, photo tools) and the Small Shop bundle (invoice and inventory).",
    keywords: ["student bundle", "small shop software bundle", "resume and PDF tools"],
  },
  "/help": {
    title: `Help & FAQ | ${SITE}`,
    description: "Answers about plans, payments, downloads, privacy and how each Sahaj tool works.",
    keywords: ["Sahaj help", "Sahaj FAQ"],
  },
  "/contact": { title: `Contact Us | ${SITE}`, description: "Questions or feedback? Contact the Sahaj team.", keywords: ["contact Sahaj"] },
  "/terms": { title: `Terms of Service | ${SITE}`, description: "The terms for using Sahaj.", keywords: [] },
  "/privacy": { title: `Privacy Policy | ${SITE}`, description: "How Sahaj handles your data. Many tools run entirely in your browser.", keywords: [] },
  "/refunds": { title: `Refund Policy | ${SITE}`, description: "Sahaj's refund and cancellation policy.", keywords: [] },
};

const PRIVATE_PREFIXES = ["/account", "/admin", "/checkout", "/login", "/register", "/forgot-password", "/reset-password", "/p/"];

export const SEO_PUBLIC_PATHS: string[] = [...Object.keys(STATIC_SEO), ...PRODUCTS.flatMap((p) => [`/tools/${p.slug}`, `/tools/${p.slug}/about`])];

export function seoFor(pathname: string): SeoMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`))) {
    return { title: SITE, description: BRAND.tagline, keywords: [], noindex: true };
  }
  const m = /^\/tools\/([^/]+)(\/about)?$/.exec(path);
  if (m) {
    const p = PRODUCTS.find((x) => x.slug === m[1]);
    if (p) {
      const s = PRODUCT_SEO[p.slug];
      return {
        title: m[2] ? `${p.name} – Features, Plans & FAQ | ${SITE}` : `${s.title} | ${SITE}`,
        description: s.description, keywords: [...s.keywords, ...ALL_TOOL_KEYWORDS.slice(0, 1)],
        jsonLd: [{
          "@context": "https://schema.org", "@type": "SoftwareApplication", name: p.name, description: s.description,
          applicationCategory: "BusinessApplication", operatingSystem: "Any (web browser)", url: `/tools/${p.slug}`,
          offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: p.free },
        }],
      };
    }
  }
  return STATIC_SEO[path] ?? { title: `Page not found | ${SITE}`, description: BRAND.tagline, keywords: [], noindex: true };
}

/** Site-wide structured data: who we are and what the site offers. */
export const siteJsonLd = (origin: string): Record<string, unknown>[] => [
  { "@context": "https://schema.org", "@type": "Organization", name: SITE, url: origin, logo: `${origin}/icon-512.png` },
  { "@context": "https://schema.org", "@type": "WebSite", name: SITE, url: origin, description: BRAND.tagline, inLanguage: ["en", "or"] },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const absolutize = (v: unknown, origin: string): unknown => {
  if (typeof v === "string") return v.startsWith("/") ? origin + v : v;
  if (Array.isArray(v)) return v.map((x) => absolutize(x, origin));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absolutize(x, origin)]));
  return v;
};

/** Renders the managed <head> tags as an HTML string (every tag carries data-seo so the browser can swap them later). */
export function renderSeoHead(pathname: string, origin: string): string {
  const m = seoFor(pathname);
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const url = origin + path;
  const img = origin + SEO_DEFAULT_IMAGE;
  const ld = [...(path === "/" ? siteJsonLd(origin) : []), ...(m.jsonLd ?? [])].map((o) => absolutize(o, origin));
  return [
    `<title data-seo>${esc(m.title)}</title>`,
    `<meta data-seo name="description" content="${esc(m.description)}" />`,
    m.keywords.length ? `<meta data-seo name="keywords" content="${esc(m.keywords.join(", "))}" />` : "",
    `<meta data-seo name="robots" content="${m.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1"}" />`,
    m.noindex ? "" : `<link data-seo rel="canonical" href="${esc(url)}" />`,
    `<meta data-seo property="og:site_name" content="${SITE}" />`,
    `<meta data-seo property="og:type" content="website" />`,
    `<meta data-seo property="og:title" content="${esc(m.title)}" />`,
    `<meta data-seo property="og:description" content="${esc(m.description)}" />`,
    `<meta data-seo property="og:url" content="${esc(url)}" />`,
    `<meta data-seo property="og:image" content="${esc(img)}" />`,
    `<meta data-seo property="og:locale" content="en_IN" />`,
    `<meta data-seo name="twitter:card" content="summary" />`,
    `<meta data-seo name="twitter:title" content="${esc(m.title)}" />`,
    `<meta data-seo name="twitter:description" content="${esc(m.description)}" />`,
    `<meta data-seo name="twitter:image" content="${esc(img)}" />`,
    ...ld.map((o) => `<script data-seo type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`),
  ].filter(Boolean).join("\n    ");
}
