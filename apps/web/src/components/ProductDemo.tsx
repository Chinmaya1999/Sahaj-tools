import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { calculateDocument, formatInr, keywordCompare, rupeesToPaise, type ProductSlug } from "@ek/shared";
import { fmtBytes } from "../lib/format";
import { Input, Select } from "./ui";

/** Small, genuinely working previews (all in-browser, nothing is uploaded or stored). */
export function ProductDemo({ slug }: { slug: ProductSlug }) {
  switch (slug) {
    case "invoice": return <InvoiceDemo />;
    case "resume": return <ResumeDemo />;
    case "inventory": return <InventoryDemo />;
    case "invitation": return <InvitationDemo />;
    case "pdf-tools": return <PdfDemo />;
    case "qr-business": return <QrDemo />;
    case "photo-tools": return <PhotoDemo />;
  }
}

function InvoiceDemo() {
  const [qty, setQty] = useState("2"); const [rate, setRate] = useState("500"); const [tax, setTax] = useState("18");
  let out; let err = "";
  try { out = calculateDocument([{ description: "Item", quantity: qty, ratePaise: rupeesToPaise(rate || "0"), taxPercent: tax }]); } catch (e) { err = (e as Error).message; }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Input label="Qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input label="Rate ₹" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        <Select label="Tax %" value={tax} onChange={(e) => setTax(e.target.value)}>{["0", "5", "12", "18", "28"].map((t) => <option key={t}>{t}</option>)}</Select>
      </div>
      {out ? <dl className="space-y-1 rounded-xl bg-paper p-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatInr(out.subtotalPaise, { compact: false })}</dd></div>
        <div className="flex justify-between"><dt>Tax</dt><dd>{formatInr(out.taxPaise, { compact: false })}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd>{formatInr(out.totalPaise, { compact: false })}</dd></div>
      </dl> : <p className="text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}

function ResumeDemo() {
  const [name, setName] = useState("Asha Mohanty"); const [skills, setSkills] = useState("React, Excel, Communication");
  const r = keywordCompare("Looking for React, Excel and SQL skills with strong communication.", skills);
  return (
    <div className="space-y-3">
      <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <Input label="Your skills (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={80} />
      <div className="rounded-xl bg-paper p-3 text-sm"><p className="font-display text-lg">{name || "Your name"}</p><p className="text-ink-2">{skills}</p>
        <p className="mt-2 text-xs">Sample job match: <b>{r.score}%</b>{r.missing.length ? ` · missing: ${r.missing.slice(0, 3).join(", ")}` : ""}</p></div>
    </div>
  );
}

function InventoryDemo() {
  const [rows, setRows] = useState([{ n: "Aloe face wash", q: 6, min: 5 }, { n: "Lip balm", q: 12, min: 5 }]);
  return (
    <ul className="space-y-2" aria-label="Sample stock">
      {rows.map((r, i) => (
        <li key={r.n} className="flex items-center justify-between rounded-xl bg-paper p-3 text-sm">
          <span>{r.n} {r.q <= r.min && <b className="ml-1 rounded bg-warn-bg px-1.5 text-xs text-warn">Low</b>}</span>
          <span className="flex items-center gap-2">
            <button aria-label={`Sell one ${r.n}`} className="h-9 w-9 rounded-lg border border-line bg-white" onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, q: Math.max(0, x.q - 1) } : x))}>−</button>
            <b className="w-6 text-center">{r.q}</b>
            <button aria-label={`Add one ${r.n}`} className="h-9 w-9 rounded-lg border border-line bg-white" onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, q: x.q + 1 } : x))}>+</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function InvitationDemo() {
  const [t, setT] = useState("Ria's Birthday"); const [c, setC] = useState("#4f46e5");
  return (
    <div className="space-y-3">
      <Input label="Title" value={t} onChange={(e) => setT(e.target.value)} maxLength={30} />
      <label className="flex items-center gap-2 text-sm">Accent colour <input aria-label="Accent colour" type="color" value={c} onChange={(e) => setC(e.target.value)} className="h-9 w-14 rounded" /></label>
      <div className="grid h-28 place-items-center rounded-xl border-2 text-center" style={{ borderColor: c, background: "#fffaf0" }}><p className="font-display text-2xl" style={{ color: c }}>{t || "Title"}</p><p className="text-xs text-ink-2">Sat · 6 PM · Your venue</p></div>
    </div>
  );
}

function PdfDemo() {
  const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);
  async function onFile(f?: File) {
    if (!f) return; setBusy(true); setInfo("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: false });
      setInfo(`${f.name}: ${doc.getPageCount()} page(s), ${fmtBytes(f.size)} – read locally, not uploaded.`);
    } catch { setInfo("That file could not be read as a PDF (it may be corrupted or password-protected)."); }
    setBusy(false);
  }
  return <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="pdf-demo">Choose a PDF to inspect</label><input id="pdf-demo" type="file" accept="application/pdf" className="block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} /><p aria-live="polite" className="text-sm text-ink-2">{busy ? "Reading…" : info}</p></div>;
}

function QrDemo() {
  const [v, setV] = useState("https://example.com"); const [img, setImg] = useState("");
  useEffect(() => { QRCode.toDataURL(v || " ", { margin: 1, width: 160 }).then(setImg).catch(() => setImg("")); }, [v]);
  return <div className="flex items-center gap-3"><div className="flex-1"><Input label="Link or text" value={v} onChange={(e) => setV(e.target.value)} maxLength={200} /></div>{img && <img src={img} alt="QR code preview" width={96} height={96} className="rounded-lg border border-line bg-white" />}</div>;
}

function PhotoDemo() {
  const [info, setInfo] = useState(""); const [url, setUrl] = useState("");
  async function onFile(f?: File) {
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const w = 120, h = Math.round((bmp.height / bmp.width) * w);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
      const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), "image/jpeg", 0.8));
      setInfo(`${bmp.width}×${bmp.height}px, ${fmtBytes(f.size)} → ${w}×${h}px, ${fmtBytes(blob.size)}`); setUrl(cv.toDataURL("image/jpeg", 0.8));
    } catch { setInfo("That file is not a supported image."); setUrl(""); }
  }
  return <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="photo-demo">Choose a photo</label><input id="photo-demo" type="file" accept="image/*" className="block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} />{url && <img src={url} alt="Resized preview" className="rounded-lg border border-line" />}<p aria-live="polite" className="text-sm text-ink-2">{info}</p></div>;
}
