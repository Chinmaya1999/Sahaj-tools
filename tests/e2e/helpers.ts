import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

export const PASSWORD = "Sup3r-secret-pass";
let n = 0;
export const email = () => `e2e${Date.now()}${n++}@test.local`;

export async function register(page: Page, name = "Asha Mohanty") {
  const e = email();
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(e);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /Hello, / })).toBeVisible();
  return e;
}
export async function login(page: Page, e: string, p = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(e);
  await page.getByLabel("Password").fill(p);
  await page.getByRole("button", { name: "Sign in" }).click();
}
export async function makePdf(pages: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([300, 300]).drawText(`Page ${i + 1}`, { x: 50, y: 150 });
  return Buffer.from(await d.save());
}
import zlib from "node:zlib";
function crc32(buf: Buffer) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
/** Builds a valid noisy RGB PNG so compression has real work to do. */
export function makePng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 7 + y * 13 + ((x * y) % 31)) & 255;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export async function buy(page: Page, planPath: string) {
  await page.goto(planPath);
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible();
}
