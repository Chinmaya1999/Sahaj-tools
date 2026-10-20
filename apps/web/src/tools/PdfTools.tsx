import { useRef, useState } from "react";
import JSZip from "jszip";
import { PDFDocument, degrees } from "pdf-lib";
import { Alert, Button, Card, Input, cx } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { useAccess } from "../lib/data";
import { isMobileApp } from "../lib/native";
import { download, fmtBytes } from "../lib/format";

type Mode = "merge" | "split" | "organize" | "images" | "optimize";
const MODES: [Mode, string][] = [["merge", "Merge"], ["split", "Split / extract"], ["organize", "Reorder / rotate"], ["images", "Images → PDF"], ["optimize", "Optimize"]];
const MAX_PAGES = 2000;

interface PdfFile { id: string; file: File; pages: number }
interface Output { name: string; blob: Blob; note?: string }

class Cancelled extends Error {}
let uid = 0;

async function readPdf(file: File, maxBytes: number): Promise<PdfFile> {
  if (file.size > maxBytes) throw new Error(`${file.name}: larger than the ${fmtBytes(maxBytes)} limit for your plan.`);
  const buf = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
  if (head !== "%PDF-") throw new Error(`${file.name}: this is not a PDF file (its contents do not start like one).`);
  try {
    const doc = await PDFDocument.load(buf); // throws on encrypted files
    if (doc.getPageCount() > MAX_PAGES) throw new Error(`${file.name}: more than ${MAX_PAGES} pages.`);
    return { id: `f${uid++}`, file, pages: doc.getPageCount() };
  } catch (e) {
    const msg = (e as Error).message;
    if (/encrypted/i.test(msg)) throw new Error(`${file.name}: this PDF is password-protected. Remove the password first, then try again.`);
    if (msg.includes("limit for your plan") || msg.includes("pages.")) throw e;
    throw new Error(`${file.name}: could not be read. The file may be corrupted.`);
  }
}

function parseRanges(s: string, max: number): number[][] {
  const out: number[][] = [];
  for (const part of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new Error(`"${part}" is not a valid page range. Use e.g. 1-3, 5, 8-10.`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > max) throw new Error(`Range "${part}" is outside this document (1–${max}).`);
    out.push(Array.from({ length: b - a + 1 }, (_, i) => a + i - 1));
  }
  if (!out.length) throw new Error("Enter at least one page or range.");
  return out;
}

export default function PdfTools() {
  const access = useAccess().get("pdf-tools");
  const maxMb = Number(access?.limits.maxFileMb ?? 25), maxFiles = Number(access?.limits.maxFiles ?? 10);
  const maxBytes = maxMb * 1024 * 1024;
  const [mode, setMode] = useState<Mode>("merge");
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [outs, setOuts] = useState<Output[]>([]);
  const [err, setErr] = useState(""); const [warn, setWarn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const cancel = useRef(false);
  const [ranges, setRanges] = useState("1-2"); const [splitMode, setSplitMode] = useState<"one" | "each" | "ranges">("one");
  const [pages, setPages] = useState<{ n: number; rot: number }[]>([]);
  const [fit, setFit] = useState<"image" | "a4">("a4");

  const reset = () => { setOuts([]); setErr(""); setWarn([]); setProgress(0); };
  const single = mode === "split" || mode === "organize";

  async function addPdfs(list: File[]) {
    reset(); const problems: string[] = []; const ok: PdfFile[] = [];
    const room = single ? 1 : maxFiles - files.length;
    if (!single && list.length > room) problems.push(`Your plan allows ${maxFiles} files per job; extra files were ignored.`);
    for (const f of list.slice(0, Math.max(room, 0) || (single ? 1 : 0))) { try { ok.push(await readPdf(f, maxBytes)); } catch (e) { problems.push((e as Error).message); } }
    setWarn(problems);
    const next = single ? ok.slice(0, 1) : [...files, ...ok];
    setFiles(next);
    if (mode === "organize" && next[0]) setPages(Array.from({ length: next[0].pages }, (_, i) => ({ n: i, rot: 0 })));
  }
  async function addImages(list: File[]) {
    reset(); const problems: string[] = []; const ok: File[] = [];
    for (const f of list) {
      if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type)) { problems.push(`${f.name}: unsupported image type.`); continue; }
      if (f.size > maxBytes) { problems.push(`${f.name}: larger than ${maxMb} MB.`); continue; }
      ok.push(f);
    }
    setWarn(problems); setImages([...images, ...ok].slice(0, maxFiles));
  }
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr], j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const tick = async (p: number) => { if (cancel.current) throw new Cancelled(); setProgress(p); await new Promise((r) => setTimeout(r, 0)); };

  async function run() {
    reset(); cancel.current = false; setBusy(true);
    try {
      const outputs: Output[] = [];
      if (mode === "merge") {
        if (files.length < 2) throw new Error("Add at least two PDFs to merge.");
        const out = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          await tick((i / files.length) * 100);
          const src = await PDFDocument.load(await files[i].file.arrayBuffer());
          (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
        }
        outputs.push({ name: "merged.pdf", blob: toBlob(await out.save()) });
      } else if (mode === "split") {
        const f = files[0]; if (!f) throw new Error("Add a PDF first.");
        const src = await PDFDocument.load(await f.file.arrayBuffer());
        const groups = splitMode === "each" ? src.getPageIndices().map((i) => [i]) : parseRanges(ranges, f.pages);
        const parts: Output[] = [];
        for (let g = 0; g < groups.length; g++) {
          await tick((g / groups.length) * 100);
          const out = await PDFDocument.create();
          (await out.copyPages(src, groups[g])).forEach((p) => out.addPage(p));
          parts.push({ name: `${base(f.file.name)}-${splitMode === "each" ? `page-${groups[g][0] + 1}` : `part-${g + 1}`}.pdf`, blob: toBlob(await out.save()) });
        }
        if (splitMode === "one") {
          const out = await PDFDocument.create();
          (await out.copyPages(src, groups.flat())).forEach((p) => out.addPage(p));
          outputs.push({ name: `${base(f.file.name)}-extracted.pdf`, blob: toBlob(await out.save()) });
        } else outputs.push(...parts);
      } else if (mode === "organize") {
        const f = files[0]; if (!f) throw new Error("Add a PDF first.");
        if (!pages.length) throw new Error("Keep at least one page.");
        const src = await PDFDocument.load(await f.file.arrayBuffer()); const out = await PDFDocument.create();
        const copied = await out.copyPages(src, pages.map((p) => p.n));
        copied.forEach((pg, i) => { pg.setRotation(degrees((pg.getRotation().angle + pages[i].rot) % 360)); out.addPage(pg); });
        outputs.push({ name: `${base(f.file.name)}-organized.pdf`, blob: toBlob(await out.save()) });
      } else if (mode === "images") {
        if (!images.length) throw new Error("Add at least one image.");
        const out = await PDFDocument.create();
        for (let i = 0; i < images.length; i++) {
          await tick((i / images.length) * 100);
          const { bytes, type } = await normaliseImage(images[i]);
          const img = type === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
          const [W, H] = fit === "a4" ? [595.28, 841.89] : [img.width, img.height];
          const page = out.addPage([W, H]);
          const s = fit === "a4" ? Math.min((W - 40) / img.width, (H - 40) / img.height) : 1;
          page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
        }
        outputs.push({ name: "images.pdf", blob: toBlob(await out.save()) });
      } else {
        if (!files.length) throw new Error("Add at least one PDF.");
        for (let i = 0; i < files.length; i++) {
          await tick((i / files.length) * 100);
          const doc = await PDFDocument.load(await files[i].file.arrayBuffer());
          doc.setTitle(""); doc.setAuthor(""); doc.setProducer(""); doc.setCreator(""); doc.setKeywords([]); doc.setSubject("");
          const bytes = await doc.save({ useObjectStreams: true });
          const smaller = bytes.length < files[i].file.size;
          outputs.push({ name: `${base(files[i].file.name)}-optimized.pdf`, blob: toBlob(smaller ? bytes : new Uint8Array(await files[i].file.arrayBuffer())), note: smaller ? `${fmtBytes(files[i].file.size)} → ${fmtBytes(bytes.length)}` : "Already compact – no reduction possible without losing quality; original kept." });
        }
      }
      setProgress(100); setOuts(outputs);
    } catch (e) {
      setErr(e instanceof Cancelled ? "Cancelled. Nothing was saved." : (e as Error).message);
    } finally { setBusy(false); }
  }
  async function saveAll() {
    if (outs.length === 1) return download(outs[0].blob, outs[0].name);
    const z = new JSZip(); outs.forEach((o) => z.file(o.name, o.blob)); download(await z.generateAsync({ type: "blob" }), "pdf-tools-output.zip");
  }

  return (
    <div className="space-y-5">
      <Alert>Your files are processed inside your browser and are <b>not uploaded</b>. Limits on your plan: {maxMb} MB per file, {maxFiles} files per job.</Alert>
      <div role="tablist" aria-label="PDF operation" className="flex flex-wrap gap-1.5">
        {MODES.map(([m, t]) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setFiles([]); setImages([]); setPages([]); reset(); }} className={cx("min-h-10 rounded-lg px-3 text-sm font-medium", mode === m ? "bg-ink text-white" : "bg-paper-2 hover:bg-line")}>{t}</button>)}
      </div>
      {mode === "images" ? <Dropzone accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" multiple onFiles={addImages} label="Add images" hint="JPEG, PNG, WebP, GIF or BMP" />
        : <Dropzone accept="application/pdf" multiple={!single} onFiles={addPdfs} label={single ? "Add a PDF" : "Add PDFs"} hint={`PDF files up to ${maxMb} MB`} />}
      {warn.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}

      {mode === "images" ? (
        <ol className="space-y-2">{images.map((f, i) => <Row key={f.name + i} name={f.name} meta={fmtBytes(f.size)} onUp={() => setImages(move(images, i, -1))} onDown={() => setImages(move(images, i, 1))} onRemove={() => setImages(images.filter((_, j) => j !== i))} />)}</ol>
      ) : mode === "organize" ? (
        <ol className="grid gap-2 sm:grid-cols-2">{pages.map((p, i) => (
          <li key={p.n} className="flex items-center justify-between rounded-xl border border-line bg-card p-3 text-sm"><span>Page {p.n + 1} {p.rot ? <b className="text-brand">↻{p.rot}°</b> : null}</span>
            <span className="flex gap-1">
              <MiniBtn label={`Move page ${p.n + 1} up`} onClick={() => setPages(move(pages, i, -1))}>↑</MiniBtn><MiniBtn label={`Move page ${p.n + 1} down`} onClick={() => setPages(move(pages, i, 1))}>↓</MiniBtn>
              <MiniBtn label={`Rotate page ${p.n + 1}`} onClick={() => setPages(pages.map((x, j) => j === i ? { ...x, rot: (x.rot + 90) % 360 } : x))}>↻</MiniBtn><MiniBtn label={`Delete page ${p.n + 1}`} onClick={() => setPages(pages.filter((_, j) => j !== i))}>✕</MiniBtn>
            </span></li>))}</ol>
      ) : (
        <ol className="space-y-2">{files.map((f, i) => <Row key={f.id} name={f.file.name} meta={`${f.pages} page(s) · ${fmtBytes(f.file.size)}`} onUp={single ? undefined : () => setFiles(move(files, i, -1))} onDown={single ? undefined : () => setFiles(move(files, i, 1))} onRemove={() => { setFiles(files.filter((_, j) => j !== i)); setPages([]); }} />)}</ol>
      )}

      {mode === "split" && files[0] && (
        <Card className="space-y-3 p-4">
          <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="mb-1 font-medium">What to do</legend>
            {([["one", "Extract pages into one PDF"], ["ranges", "Split into parts (one PDF per range, ZIP)"], ["each", "Every page as its own PDF (ZIP)"]] as const).map(([v, t]) => <label key={v} className="flex min-h-9 items-center gap-2"><input type="radio" name="sm" checked={splitMode === v} onChange={() => setSplitMode(v)} />{t}</label>)}</fieldset>
          {splitMode !== "each" && <Input label={`Pages (document has ${files[0].pages})`} value={ranges} onChange={(e) => setRanges(e.target.value)} hint="Example: 1-3, 5, 8-10" />}
        </Card>)}
      {mode === "images" && <label className="flex items-center gap-2 text-sm">Page size <select className="min-h-11 rounded-xl border border-line bg-white px-3" value={fit} onChange={(e) => setFit(e.target.value as any)}><option value="a4">A4 (image fitted with margin)</option><option value="image">Same size as each image</option></select></label>}
      {mode === "optimize" && <Alert>Optimize rewrites the PDF more compactly and removes document metadata. Savings vary and can be small; it does not recompress embedded images.</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} loading={busy} disabled={busy}>Run</Button>
        {busy && <Button variant="secondary" onClick={() => (cancel.current = true)}>Cancel</Button>}
        {busy && <div className="h-2 w-48 overflow-hidden rounded bg-paper-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div>}
      </div>
      {err && <Alert tone="bad">{err}</Alert>}
      {outs.length > 0 && (
        <Card className="space-y-2 p-4"><h2 className="text-lg">Result</h2>
          <ul className="space-y-1 text-sm">{outs.map((o) => <li key={o.name} className="flex flex-wrap items-center justify-between gap-2"><span>{o.name} · <b>{fmtBytes(o.blob.size)}</b>{o.note && <span className="text-ink-2"> · {o.note}</span>}</span><span className="flex gap-2"><Button variant="secondary" onClick={() => (isMobileApp() ? download(o.blob, o.name) : window.open(URL.createObjectURL(o.blob), "_blank"))}>{isMobileApp() ? "Open" : "Preview"}</Button><Button variant="secondary" onClick={() => download(o.blob, o.name)}>Download</Button></span></li>)}</ul>
          {outs.length > 1 && <Button onClick={saveAll}>Download all as ZIP</Button>}
        </Card>)}
    </div>
  );
}

const base = (n: string) => n.replace(/\.[^.]+$/, "");
const toBlob = (b: Uint8Array) => new Blob([b as BlobPart], { type: "application/pdf" });
function MiniBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="h-10 w-10 rounded-lg border border-line bg-white hover:bg-paper-2">{children}</button>;
}
function Row({ name, meta, onUp, onDown, onRemove }: { name: string; meta: string; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return <li className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-3 text-sm"><span className="min-w-0 truncate"><b>{name}</b> <span className="text-ink-2">{meta}</span></span><span className="flex gap-1">{onUp && <MiniBtn label={`Move ${name} up`} onClick={onUp}>↑</MiniBtn>}{onDown && <MiniBtn label={`Move ${name} down`} onClick={onDown}>↓</MiniBtn>}<MiniBtn label={`Remove ${name}`} onClick={onRemove}>✕</MiniBtn></span></li>;
}
async function normaliseImage(f: File): Promise<{ bytes: Uint8Array; type: "png" | "jpg" }> {
  const buf = new Uint8Array(await f.arrayBuffer());
  if (f.type === "image/jpeg" && buf[0] === 0xff && buf[1] === 0xd8) return { bytes: buf, type: "jpg" };
  if (f.type === "image/png" && buf[0] === 0x89 && buf[1] === 0x50) return { bytes: buf, type: "png" };
  const bmp = await createImageBitmap(f); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0);
  const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error(`${f.name}: could not be converted.`))), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "png" };
}
