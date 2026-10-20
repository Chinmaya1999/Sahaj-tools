/** Pure helpers shared by API and web. */

export function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!s) throw new Error("URL is required");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { throw new Error("Enter a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http and https links are allowed");
  if (!u.hostname.includes(".") && u.hostname !== "localhost") throw new Error("Enter a valid URL");
  if (u.username || u.password) throw new Error("Links with embedded credentials are not allowed");
  return u.toString();
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set(["admin", "api", "login", "register", "app", "p", "www", "help", "pricing", "support", "static", "assets", "dashboard"]);
export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && !RESERVED_SLUGS.has(s) && !s.includes("--");
}

export function digitsOnly(s: string): string { return s.replace(/\D/g, ""); }

export type QrKind = "url" | "contact" | "whatsapp" | "upi" | "text";
export interface QrInput {
  url?: string;
  name?: string; phone?: string; email?: string; org?: string; website?: string;
  message?: string;
  upiId?: string; payeeName?: string; amount?: string; note?: string;
  text?: string;
}
const vEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[;,]/g, (m) => `\\${m}`);

/** Builds the string encoded in a QR code. Never includes secrets – only what the user typed. */
export function buildQrPayload(kind: QrKind, i: QrInput): string {
  switch (kind) {
    case "url": return normalizeUrl(i.url ?? "");
    case "text": {
      const t = (i.text ?? "").trim();
      if (!t) throw new Error("Text is required");
      if (t.length > 1000) throw new Error("Text is too long for a reliable QR code");
      return t;
    }
    case "contact": {
      const name = (i.name ?? "").trim();
      if (!name) throw new Error("Name is required");
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(name)}`];
      if (i.org?.trim()) lines.push(`ORG:${vEsc(i.org.trim())}`);
      if (i.phone?.trim()) lines.push(`TEL:${i.phone.replace(/[^\d+]/g, "")}`);
      if (i.email?.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) throw new Error("Enter a valid email");
        lines.push(`EMAIL:${i.email.trim()}`);
      }
      if (i.website?.trim()) lines.push(`URL:${normalizeUrl(i.website)}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "whatsapp": {
      const p = digitsOnly(i.phone ?? "");
      if (p.length < 8 || p.length > 15) throw new Error("Enter the number with country code, e.g. 919876543210");
      const q = i.message?.trim() ? `?text=${encodeURIComponent(i.message.trim().slice(0, 500))}` : "";
      return `https://wa.me/${p}${q}`;
    }
    case "upi": {
      const id = (i.upiId ?? "").trim();
      if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(id)) throw new Error("Enter a valid UPI ID, e.g. name@bank");
      const params = new URLSearchParams({ pa: id, cu: "INR" });
      if (i.payeeName?.trim()) params.set("pn", i.payeeName.trim().slice(0, 60));
      if (i.amount?.trim()) {
        if (!/^\d{1,7}(\.\d{1,2})?$/.test(i.amount.trim()) || Number(i.amount) <= 0) throw new Error("Enter a valid amount");
        params.set("am", i.amount.trim());
      }
      if (i.note?.trim()) params.set("tn", i.note.trim().slice(0, 50));
      return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
    }
  }
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

/** CSV writer that also neutralises spreadsheet formula injection. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}

export function daysUntil(date: Date | string, now = new Date()): number {
  const d = new Date(date);
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86400000);
}

/** Keyword comparison between a job description and resume text (deterministic, no AI). */
const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our this these those their they them can may must should would about into over under per using use used work working experience years year ability strong good new etc job role team skills skill required requirements responsibilities candidate looking".split(" "));
export function keywordCompare(jd: string, resume: string) {
  const tok = (s: string) => (s.toLowerCase().match(/[a-z][a-z+#.\-]{1,}/g) ?? []).map((t) => t.replace(/[.\-]+$/, ""));
  const freq = new Map<string, number>();
  for (const t of tok(jd)) if (!STOP.has(t) && t.length > 2) freq.set(t, (freq.get(t) ?? 0) + 1);
  const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([k]) => k);
  const have = new Set(tok(resume));
  const matched = keywords.filter((k) => have.has(k));
  const missing = keywords.filter((k) => !have.has(k));
  return { keywords, matched, missing, score: keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0 };
}
