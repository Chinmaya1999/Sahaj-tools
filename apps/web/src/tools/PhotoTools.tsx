import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Alert, Button, Card, Input, Select } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { useAccess } from "../lib/data";
import { download, fmtBytes } from "../lib/format";
import { PRESETS } from "./photoPresets";

interface Result { id: number; name: string; blob?: Blob; url?: string; width?: number; height?: number; note?: string; status: "pending" | "working" | "done" | "error" | "warn" }
const MAX_PIXELS = 50_000_000, MAX_BYTES = 40 * 1024 * 1024;
const ext = { jpeg: "jpg", png: "png", webp: "webp" } as const;
const mime = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const yieldUi = () => new Promise((r) => setTimeout(r, 0));
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

export async function processImage(file: File, o: { width: number; height: number; maxKb: number; format: "jpeg" | "png" | "webp"; fit: "cover" | "contain" | "stretch" }) {
  const bmp = await createImageBitmap(file);
  if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close(); throw new Error("This image has too many pixels to process safely (over 50 megapixels)."); }
  let W = o.width, H = o.height;
  if (!W && !H) { W = bmp.width; H = bmp.height; } else if (!H) H = Math.round((bmp.height / bmp.width) * W); else if (!W) W = Math.round((bmp.width / bmp.height) * H);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
  if (o.format === "jpeg" || o.fit === "contain") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); }
  if (o.fit === "stretch") ctx.drawImage(bmp, 0, 0, W, H);
  else {
    const s = o.fit === "cover" ? Math.max(W / bmp.width, H / bmp.height) : Math.min(W / bmp.width, H / bmp.height);
    const dw = bmp.width * s, dh = bmp.height * s; ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  bmp.close();
  const limit = o.maxKb * 1024;
  if (o.format === "png") {
    const b = (await toBlob(c, "image/png"))!;
    return { blob: b, width: W, height: H, note: !limit || b.size <= limit ? "" : `PNG cannot be compressed by quality. It is ${fmtBytes(b.size)}, above ${o.maxKb} KB – choose JPEG or WebP, or smaller dimensions.`, ok: !limit || b.size <= limit };
  }
  let hi = 0.95, lo = 0.3, best = (await toBlob(c, mime[o.format], hi))!;
  if (!limit || best.size <= limit) return { blob: best, width: W, height: H, note: "", ok: true };
  const floor = (await toBlob(c, mime[o.format], lo))!;
  if (floor.size > limit) return { blob: floor, width: W, height: H, note: `Could not reach ${o.maxKb} KB at acceptable quality: the smallest version is ${fmtBytes(floor.size)}. Try a larger limit or smaller dimensions.`, ok: false };
  for (let i = 0; i < 7; i++) { const mid = (hi + lo) / 2; const b = (await toBlob(c, mime[o.format], mid))!; if (b.size <= limit) { best = b; lo = mid; } else hi = mid; }
  return { blob: best, width: W, height: H, note: "", ok: true };
}

export default function PhotoTools() {
  const maxFiles = Number(useAccess().get("photo-tools")?.limits.maxFiles ?? 1);
  const [files, setFiles] = useState<File[]>([]);
  const [presetId, setPresetId] = useState("passport-413");
  const preset = PRESETS.find((p) => p.id === presetId);
  const [w, setW] = useState("413"); const [h, setH] = useState("531"); const [kb, setKb] = useState("100"); const [format, setFormat] = useState<"jpeg" | "png" | "webp">("jpeg"); const [fit, setFit] = useState<"cover" | "contain" | "stretch">("cover");
  const [results, setResults] = useState<Result[]>([]); const [busy, setBusy] = useState(false); const [msgs, setMsgs] = useState<string[]>([]);

  useEffect(() => { if (preset) { setW(String(preset.width)); setH(String(preset.height || "")); setKb(String(preset.maxKb)); setFormat(preset.format); setFit(preset.fit); } }, [presetId]);
  useEffect(() => () => results.forEach((r) => r.url && URL.revokeObjectURL(r.url)), []);

  function add(list: File[]) {
    const m: string[] = []; const ok: File[] = [];
    for (const f of list) {
      if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type)) { m.push(`${f.name}: unsupported format. Use JPEG, PNG, WebP, GIF or BMP.`); continue; }
      if (f.size > MAX_BYTES) { m.push(`${f.name}: larger than 40 MB.`); continue; }
      ok.push(f);
    }
    const room = maxFiles - (maxFiles === 1 ? 0 : files.length);
    if (ok.length > room) m.push(`Your plan processes up to ${maxFiles} image(s) at a time.${maxFiles === 1 ? " Batch processing is a paid feature." : ""}`);
    setMsgs(m); setFiles(maxFiles === 1 ? ok.slice(0, 1) : [...files, ...ok.slice(0, Math.max(room, 0))]); setResults([]);
  }
  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const wn = num(w), hn = num(h);
  const invalid = !Number.isInteger(wn) || !Number.isInteger(hn) || wn < 0 || hn < 0 || wn > 10000 || hn > 10000 || (wn === 0 && hn === 0) || !(num(kb) >= 0);

  async function run() {
    if (invalid) { setMsgs(["Width and height must be whole numbers from 1 to 10000 (leave one blank to keep the ratio)."]); return; }
    setBusy(true); setMsgs([]); results.forEach((r) => r.url && URL.revokeObjectURL(r.url));
    const out: Result[] = files.map((f, i) => ({ id: i, name: f.name, status: "pending" })); setResults([...out]);
    for (let i = 0; i < files.length; i++) {
      out[i].status = "working"; setResults([...out]); await yieldUi();
      try {
        const r = await processImage(files[i], { width: num(w), height: num(h), maxKb: num(kb), format, fit });
        Object.assign(out[i], { blob: r.blob, url: URL.createObjectURL(r.blob), width: r.width, height: r.height, note: r.note, status: r.ok ? "done" : "warn" });
      } catch (e) { Object.assign(out[i], { status: "error", note: /decode|source image/i.test((e as Error).message) ? "This file could not be read as an image." : (e as Error).message }); }
      setResults([...out]);
    }
    setBusy(false);
  }
  const outName = (r: Result) => `${r.name.replace(/\.[^.]+$/, "")}-resized.${ext[format]}`;
  async function zip() { const z = new JSZip(); results.filter((r) => r.blob).forEach((r) => z.file(outName(r), r.blob!)); download(await z.generateAsync({ type: "blob" }), "resized-images.zip"); }

  return (
    <div className="space-y-5">
      <Alert>Photos are resized inside your browser and <b>never uploaded</b>. Presets are common examples – <b>we cannot promise any portal will accept the result</b>, so always check the official requirements.</Alert>
      <Dropzone accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" multiple onFiles={add} label={maxFiles > 1 ? "Add photos" : "Add a photo"} hint={`JPEG, PNG, WebP, GIF or BMP · up to ${maxFiles} at a time`} />
      {msgs.map((m) => <Alert key={m} tone="warn">{m}</Alert>)}
      {files.length > 0 && <ul className="flex flex-wrap gap-2 text-sm">{files.map((f, i) => <li key={f.name + i} className="rounded-lg border border-line bg-card px-3 py-1.5">{f.name} · {fmtBytes(f.size)} <button aria-label={`Remove ${f.name}`} className="ml-1 text-bad" onClick={() => { setFiles(files.filter((_, j) => j !== i)); setResults([]); }}>✕</button></li>)}</ul>}
      <Card className="space-y-4 p-5">
        <Select label="Preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="custom">Custom</option></Select>
        {preset && presetId !== "custom" && <p className="text-sm text-ink-2"><b>Preset requirements:</b> {preset.requirements}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Input label="Width (px)" inputMode="numeric" value={w} onChange={(e) => { setW(e.target.value); setPresetId("custom"); }} hint="Blank keeps ratio" />
          <Input label="Height (px)" inputMode="numeric" value={h} onChange={(e) => { setH(e.target.value); setPresetId("custom"); }} hint="Blank keeps ratio" />
          <Input label="Max size (KB)" inputMode="numeric" value={kb} onChange={(e) => { setKb(e.target.value); setPresetId("custom"); }} hint="0 = no limit" />
          <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as any)}><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="png">PNG</option></Select>
        </div>
        <Select label="Fit" value={fit} onChange={(e) => setFit(e.target.value as any)}><option value="cover">Crop to fill exact size (centred)</option><option value="contain">Keep whole image (add white margin)</option><option value="stretch">Stretch to exact size (may distort)</option></Select>
        <Button onClick={run} loading={busy} disabled={!files.length || busy}>Resize {files.length > 1 ? `${files.length} images` : "image"}</Button>
      </Card>
      {results.length > 0 && (
        <Card className="space-y-3 p-5" aria-live="polite"><h2 className="text-lg">Results</h2>
          <ul className="space-y-3">{results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
              {r.url ? <img src={r.url} alt={`Preview of ${r.name}`} className="h-20 w-20 rounded-lg border border-line object-contain" /> : <div className="grid h-20 w-20 place-items-center rounded-lg bg-paper-2 text-xs">{r.status === "working" ? "…" : r.status}</div>}
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p>
                {r.blob ? <p>{r.width} × {r.height} px · <b>{fmtBytes(r.blob.size)}</b> {format.toUpperCase()} {r.status === "done" ? <span className="text-ok">✓ within limit</span> : null}</p> : null}
                {r.note && <p className={r.status === "error" ? "text-bad" : "text-warn"}>{r.note}</p>}</div>
              {r.blob && <Button variant="secondary" onClick={() => download(r.blob!, outName(r))}>Download</Button>}
            </li>))}</ul>
          {results.filter((r) => r.blob).length > 1 && <Button onClick={zip}>Download all as ZIP</Button>}
        </Card>)}
    </div>
  );
}
