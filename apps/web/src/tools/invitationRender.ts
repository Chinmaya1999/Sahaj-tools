import type { InvitationInput } from "@ek/shared";

export const SIZES = { screen: { w: 1080, h: 1528, label: "1080 × 1528 px (screen / WhatsApp)" }, print: { w: 1748, h: 2480, label: "1748 × 2480 px (A5 at 300 dpi, print quality)" } } as const;
export const LABELS = {
  en: { date: "Date", time: "Time", venue: "Venue", contact: "Contact", invited: "You are warmly invited" },
  or: { date: "ତାରିଖ", time: "ସମୟ", venue: "ସ୍ଥାନ", contact: "ଯୋଗାଯୋଗ", invited: "ଆପଣଙ୍କୁ ସାଦର ନିମନ୍ତ୍ରଣ" },
} as const;
export const DEFAULTS: Record<string, { en: string; or: string }> = {
  birthday: { en: "Birthday Celebration", or: "ଜନ୍ମଦିନ ଉତ୍ସବ" },
  wedding: { en: "Wedding Invitation", or: "ବିବାହ ନିମନ୍ତ୍ରଣ" },
  anniversary: { en: "Anniversary Celebration", or: "ବିବାହ ବାର୍ଷିକୀ" },
  housewarming: { en: "Housewarming", or: "ଗୃହ ପ୍ରବେଶ" },
  festival: { en: "Festival Greetings", or: "ପର୍ବ ଉତ୍ସବ" },
  event: { en: "You're Invited", or: "ନିମନ୍ତ୍ରଣ" },
};
export const fontFor = (lang: "en" | "or") => (lang === "or" ? '"Noto Sans Oriya", "Noto Sans", sans-serif' : '"Fraunces", Georgia, serif');
const bodyFont = (lang: "en" | "or") => (lang === "or" ? '"Noto Sans Oriya", "Noto Sans", sans-serif' : '"Inter", system-ui, sans-serif');

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    // split on spaces; very long unbroken words are split by character so they never overflow
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) line = word;
      else { let chunk = ""; for (const ch of [...word]) { if (ctx.measureText(chunk + ch).width > maxW) { out.push(chunk); chunk = ch; } else chunk += ch; } line = chunk; }
    }
    out.push(line);
  }
  return out;
}

export type Background = { kind: "solid" } | { kind: "gradient" } | { kind: "dots" } | { kind: "image"; img: ImageBitmap };

/** Draws the invitation. Layout scales from a 1080-wide design so all export sizes look the same. */
export function drawInvitation(canvas: HTMLCanvasElement, d: InvitationInput, bg: Background, w: number, h: number, watermark: boolean) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!; const k = w / 1080;
  const { background, text, accent } = d.colours; const lang = d.language;
  ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
  if (bg.kind === "gradient") { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, background); g.addColorStop(1, accent + "33"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  if (bg.kind === "dots") { ctx.fillStyle = accent + "22"; for (let y = 30 * k; y < h; y += 60 * k) for (let x = 30 * k; x < w; x += 60 * k) { ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, 7); ctx.fill(); } }
  if (bg.kind === "image") { const s = Math.max(w / bg.img.width, h / bg.img.height); ctx.drawImage(bg.img, (w - bg.img.width * s) / 2, (h - bg.img.height * s) / 2, bg.img.width * s, bg.img.height * s); ctx.fillStyle = background + "cc"; ctx.fillRect(60 * k, 60 * k, w - 120 * k, h - 120 * k); }
  if (d.layout === "frame" || d.layout === "centered") {
    ctx.strokeStyle = accent; ctx.lineWidth = (d.layout === "frame" ? 14 : 4) * k; ctx.strokeRect(50 * k, 50 * k, w - 100 * k, h - 100 * k);
    if (d.layout === "frame") { ctx.lineWidth = 3 * k; ctx.strokeRect(80 * k, 80 * k, w - 160 * k, h - 160 * k); }
  }
  const left = d.layout === "left"; const pad = 130 * k; const maxW = w - pad * 2; const x = left ? pad : w / 2;
  ctx.textAlign = left ? "left" : "center"; ctx.textBaseline = "alphabetic";
  let y = 250 * k;
  const block = (txt: string, size: number, color: string, weight: number, font: string, gap: number, lh = 1.3) => {
    if (!txt.trim()) return;
    ctx.font = `${weight} ${size * k}px ${font}`; ctx.fillStyle = color;
    for (const line of wrap(ctx, txt, maxW)) { ctx.fillText(line, x, y); y += size * lh * k; }
    y += gap * k;
  };
  const F = d.fields; const L = LABELS[lang];
  block(L.invited, 34, accent, 500, bodyFont(lang), 30);
  block(F.heading || DEFAULTS[d.occasion][lang], 84, text, 600, fontFor(lang), 30, 1.2);
  block(F.names, 64, accent, 600, fontFor(lang), 50, 1.25);
  block(F.message, 38, text, 400, bodyFont(lang), 60, 1.5);
  const row = (label: string, v: string) => { if (!v.trim()) return; block(label.toUpperCase(), 26, accent, 600, bodyFont(lang), 4); block(v, 42, text, 500, bodyFont(lang), 34); };
  row(L.date, F.date); row(L.time, F.time); row(L.venue, F.venue); row(L.contact, F.contact);
  if (y > h - 100 * k) { ctx.font = `600 ${26 * k}px ${bodyFont("en")}`; ctx.fillStyle = "#b42318"; ctx.textAlign = "center"; ctx.fillText("Text is too long for this page – shorten it", w / 2, h - 70 * k); }
  if (watermark) {
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); ctx.font = `700 ${90 * k}px "Inter", sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillText("Oqzra · free preview", 0, 0); ctx.fillText("Oqzra · free preview", 0, 220 * k); ctx.fillText("Oqzra · free preview", 0, -220 * k); ctx.restore();
  }
}
