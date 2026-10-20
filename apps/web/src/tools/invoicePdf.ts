import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import latin from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import latinBold from "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url";
import latinExt from "@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url";
import latinExtBold from "@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url";
import oriya from "@fontsource/noto-sans-oriya/files/noto-sans-oriya-oriya-400-normal.woff?url";
import { formatInr, paymentStatus } from "@ek/shared";

export interface DocLine { description: string; quantity: number; ratePaise: number; taxPercent: number; totalPaise: number; taxPaise: number }
export interface DocView {
  kind: "invoice" | "quotation"; number: string; issueDate: string; dueDate?: string | null; customer: { name: string; phone?: string; email?: string; address?: string; taxId?: string };
  lines: DocLine[]; subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number; paidPaise: number; notes?: string; template: string; status: string;
}
export interface BizView { name: string; address?: string; phone?: string; email?: string; taxId?: string; taxLabel?: string; logoDataUrl?: string }

const cache = new Map<string, Promise<Uint8Array>>();
const load = (url: string) => { if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b))); return cache.get(url)!; };

interface Face { font: PDFFont; has: (cp: number) => boolean }
async function faces(pdf: PDFDocument, urls: string[]): Promise<Face[]> {
  const out: Face[] = [];
  for (const u of urls) {
    const bytes = await load(u);
    const kit = (fontkit as any).create(bytes);
    out.push({ font: await pdf.embedFont(bytes, { subset: true }), has: (cp) => kit.hasGlyphForCodePoint(cp) });
  }
  return out;
}
/** Draws text choosing, per character, the first font that has a glyph (handles ₹ and Odia names). */
function drawMixed(page: PDFPage, text: string, x: number, y: number, size: number, chain: Face[], color = rgb(0.12, 0.11, 0.1)) {
  let cursor = x; let run = ""; let cur: Face | null = null;
  const flush = () => { if (run && cur) { page.drawText(run, { x: cursor, y, size, font: cur.font, color }); cursor += cur.font.widthOfTextAtSize(run, size); } run = ""; };
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0)!; const f = chain.find((c) => c.has(cp)) ?? chain[0];
    if (f !== cur) { flush(); cur = f; }
    run += ch;
  }
  flush(); return cursor - x;
}
const widthMixed = (text: string, size: number, chain: Face[]) => { let w = 0; for (const ch of text) { const cp = ch.codePointAt(0)!; const f = chain.find((c) => c.has(cp)) ?? chain[0]; w += f.font.widthOfTextAtSize(ch, size); } return w; };
function wrapText(text: string, size: number, maxW: number, chain: Face[]): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${word}` : word; if (widthMixed(t, size, chain) <= maxW) line = t; else { if (line) lines.push(line); line = word; } }
    lines.push(line);
  }
  return lines;
}
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export async function buildInvoicePdf(doc: DocView, biz: BizView, opts: { branding?: boolean } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular = await faces(pdf, [latin, latinExt, oriya]); const bold = await faces(pdf, [latinBold, latinExtBold, oriya]);
  const accent = doc.template === "modern" ? hex("#4f46e5") : doc.template === "minimal" ? hex("#1f1d1a") : hex("#334155");
  const W = 595.28, H = 841.89, M = 40;
  let page = pdf.addPage([W, H]); let y = H - M;
  const grey = rgb(0.4, 0.4, 0.4);
  const money = (p: number) => formatInr(p, { compact: false });

  if (doc.template === "modern") page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: accent });
  const headColor = doc.template === "modern" ? rgb(1, 1, 1) : rgb(0.12, 0.11, 0.1);
  if (biz.logoDataUrl) {
    try {
      const b64 = biz.logoDataUrl.split(",")[1]; const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = biz.logoDataUrl.startsWith("data:image/png") ? await pdf.embedPng(bytes) : biz.logoDataUrl.startsWith("data:image/jpeg") ? await pdf.embedJpg(bytes) : null;
      if (img) { const s = Math.min(60 / img.height, 120 / img.width); page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s }); }
    } catch { /* logo is optional */ }
  }
  const title = doc.kind === "invoice" ? "INVOICE" : "QUOTATION";
  drawMixed(page, title, W - M - widthMixed(title, 24, bold), y - 20, 24, bold, doc.template === "modern" ? rgb(1, 1, 1) : accent);
  const numLine = `# ${doc.number}`; drawMixed(page, numLine, W - M - widthMixed(numLine, 11, regular), y - 38, 11, regular, headColor);
  y -= 80; if (doc.template === "modern") y -= 20;

  drawMixed(page, biz.name, M, y, 14, bold); y -= 15;
  for (const l of [biz.address, biz.phone, biz.email, biz.taxId ? `${biz.taxLabel || "Tax ID"}: ${biz.taxId}` : ""].filter(Boolean) as string[]) for (const w of wrapText(l, 9, 240, regular)) { drawMixed(page, w, M, y, 9, regular, grey); y -= 12; }
  let ry = H - M - 110 - (doc.template === "modern" ? 20 : 0) + 30;
  const meta: [string, string][] = [["Issue date", new Date(doc.issueDate).toLocaleDateString("en-IN")], ...(doc.dueDate ? [["Due date", new Date(doc.dueDate).toLocaleDateString("en-IN")] as [string, string]] : [])];
  if (doc.kind === "invoice") meta.push(["Payment", paymentStatus(doc.totalPaise, doc.paidPaise, doc.dueDate).toUpperCase()]);
  for (const [k, v] of meta) { drawMixed(page, k, W - M - 190, ry, 9, regular, grey); drawMixed(page, v, W - M - 100, ry, 9, bold); ry -= 13; }
  y = Math.min(y, ry) - 18;

  drawMixed(page, "BILL TO", M, y, 8, bold, grey); y -= 13;
  drawMixed(page, doc.customer.name, M, y, 11, bold); y -= 13;
  for (const l of [doc.customer.address, doc.customer.phone, doc.customer.email, doc.customer.taxId ? `Tax ID: ${doc.customer.taxId}` : ""].filter(Boolean) as string[]) for (const w of wrapText(l, 9, 260, regular)) { drawMixed(page, w, M, y, 9, regular, grey); y -= 12; }
  y -= 16;

  const cols = { desc: M, qty: 330, rate: 380, tax: 450, amt: W - M };
  const header = () => {
    page.drawRectangle({ x: M - 4, y: y - 5, width: W - 2 * M + 8, height: 20, color: doc.template === "minimal" ? rgb(0.94, 0.94, 0.94) : accent });
    const c = doc.template === "minimal" ? rgb(0.1, 0.1, 0.1) : rgb(1, 1, 1);
    drawMixed(page, "Description", cols.desc, y, 9, bold, c); drawMixed(page, "Qty", cols.qty, y, 9, bold, c); drawMixed(page, "Rate", cols.rate, y, 9, bold, c); drawMixed(page, "Tax %", cols.tax, y, 9, bold, c);
    drawMixed(page, "Amount", cols.amt - widthMixed("Amount", 9, bold), y, 9, bold, c); y -= 22;
  };
  header();
  for (const l of doc.lines) {
    const desc = wrapText(l.description, 9.5, cols.qty - cols.desc - 12, regular);
    if (y - desc.length * 12 < 160) { page = pdf.addPage([W, H]); y = H - M; header(); }
    drawMixed(page, String(l.quantity), cols.qty, y, 9.5, regular); drawMixed(page, money(l.ratePaise), cols.rate, y, 9.5, regular); drawMixed(page, `${l.taxPercent}%`, cols.tax, y, 9.5, regular);
    const amt = money(l.totalPaise - l.taxPaise); drawMixed(page, amt, cols.amt - widthMixed(amt, 9.5, regular), y, 9.5, regular);
    desc.forEach((line, i) => drawMixed(page, line, cols.desc, y - i * 12, 9.5, regular)); y -= desc.length * 12 + 6;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
  }
  y -= 10; if (y < 170) { page = pdf.addPage([W, H]); y = H - M; }
  const tot = (label: string, value: string, strong = false) => { const f = strong ? bold : regular; drawMixed(page, label, 360, y, strong ? 11 : 9.5, f, strong ? rgb(0.1, 0.1, 0.1) : grey); drawMixed(page, value, W - M - widthMixed(value, strong ? 11 : 9.5, f), y, strong ? 11 : 9.5, f); y -= strong ? 18 : 14; };
  tot("Subtotal", money(doc.subtotalPaise)); if (doc.discountPaise) tot("Discount", `- ${money(doc.discountPaise)}`); tot("Tax", money(doc.taxPaise)); tot("Total", money(doc.totalPaise), true);
  if (doc.kind === "invoice") { tot("Paid", money(doc.paidPaise)); tot("Balance due", money(doc.totalPaise - doc.paidPaise), true); }
  if (doc.notes) { y -= 12; drawMixed(page, "Notes", M, y, 9, bold, grey); y -= 12; for (const w of wrapText(doc.notes, 9, W - 2 * M, regular)) { if (y < 50) { page = pdf.addPage([W, H]); y = H - M; } drawMixed(page, w, M, y, 9, regular); y -= 12; } }
  pdf.getPages().forEach((p, i, all) => drawMixed(p, `Page ${i + 1} of ${all.length}${opts.branding === false ? "" : " · generated with Oqzra"}`, M, 24, 7.5, regular, grey));
  return pdf.save();
}
