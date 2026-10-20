// Generates every raster brand asset from vector sources, so the three apps always match the website logo.
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("./brand/", import.meta.url)); // handles spaces in the folder path
mkdirSync(out, { recursive: true });

// The "S" mark from the website's logo (components/Logo.tsx), viewBox 64 x 64.
const S = `<path d="M43 21.5c-2.2-3.4-5.8-5.2-10.4-5.2-6.2 0-10.4 3.2-10.4 8 0 11.2 21.2 5.2 21.2 17.2 0 5-4.6 8.8-11.3 8.8-5 0-9.4-2.2-11.9-5.8" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48.5" cy="15.5" r="5" fill="url(#gold)"/>`;
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d6bf5"/><stop offset="1" stop-color="#3b33c4"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>`;

// Full-bleed square icon (iOS, Windows, legacy Android). Platforms round/mask it themselves.
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">${defs}<rect width="64" height="64" fill="url(#g)"/>${S}</svg>`;
// Android adaptive icon: mark only, kept inside the central 61% "safe zone" so launcher masks never clip it.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">${defs}<g transform="translate(32 32) scale(0.62) translate(-32 -32)">${S}</g></svg>`;
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">${defs}<rect width="64" height="64" fill="url(#g)"/></svg>`;
// Splash screens: the logo tile on the app's dark / light background with a soft glow.
const splash = (bgc, glow) => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">${defs}<rect width="2732" height="2732" fill="${bgc}"/><circle cx="1366" cy="1366" r="620" fill="${glow}" opacity="0.22"/><g transform="translate(1066 1066) scale(9.375)"><rect width="64" height="64" rx="16" fill="url(#g)"/>${S}</g></svg>`;

const jobs = [
  ["icon-only.png", iconOnly, 1024], ["icon-foreground.png", fg, 1024], ["icon-background.png", bg, 1024],
  ["splash.png", splash("#eef3ff", "#4f46e5"), 2732], ["splash-dark.png", splash("#050816", "#22d3ee"), 2732],
];
for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg), { density: 144 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out + name);
  console.log("wrote", name);
}
await sharp(Buffer.from(iconOnly), { density: 144 }).resize(512, 512).png().toFile(out + "icon-512.png");
writeFileSync(out + "logo-mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${defs}<rect width="64" height="64" rx="16" fill="url(#g)"/>${S}</svg>`);
console.log("wrote icon-512.png, logo-mark.svg");
