import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { buildQrPayload, isValidSlug, normalizeUrl, slugify, type QrKind, type QrInput } from "@ek/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Input, LinkButton, Select, Textarea, cx } from "../components/ui";
import { BusinessPageView } from "../components/BusinessPageView";
import { api, ApiError, errMsg } from "../lib/api";
import { useAuth } from "../lib/auth";
import { download } from "../lib/format";
import { useToast } from "../components/toast";

const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export default function QrBusiness() {
  const [tab, setTab] = useState<"qr" | "page">("qr");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="QR tools" className="flex gap-1.5">
        {([["qr", "QR codes"], ["page", "Mini-business page"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("min-h-10 rounded-lg px-4 text-sm font-medium", tab === k ? "bg-ink text-white" : "bg-paper-2 hover:bg-line")}>{t}</button>)}
      </div>
      {tab === "qr" ? <QrMaker /> : <PageBuilder />}
    </div>
  );
}

function QrMaker() {
  const { user } = useAuth();
  const mine = useQuery({ queryKey: ["page-mine"], queryFn: () => api<any>("/pages/mine"), enabled: !!user });
  const [kind, setKind] = useState<QrKind>("url");
  const [f, setF] = useState<QrInput>({ url: "https://" });
  const [ec, setEc] = useState<"L" | "M" | "Q" | "H">("M");
  const [fg, setFg] = useState("#1f1d1a"); const [bg, setBg] = useState("#ffffff");
  const [svg, setSvg] = useState(""); const [png, setPng] = useState(""); const [err, setErr] = useState(""); const [poster, setPoster] = useState(false);
  const set = (k: keyof QrInput) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const ratio = contrast(fg, bg);
  const [title, setTitle] = useState("Scan me");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const payload = buildQrPayload(kind, f);
        const opts = { errorCorrectionLevel: ec, margin: 2, color: { dark: fg, light: bg } } as const;
        const [s, p] = await Promise.all([QRCode.toString(payload, { ...opts, type: "svg" }), QRCode.toDataURL(payload, { ...opts, width: 1024 })]);
        if (live) { setSvg(s); setPng(p); setErr(""); }
      } catch (e) { if (live) { setErr((e as Error).message); setSvg(""); setPng(""); } }
    })();
    return () => { live = false; };
  }, [kind, f, ec, fg, bg]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <Select label="What should the QR code open?" value={kind} onChange={(e) => { setKind(e.target.value as QrKind); setF({ url: "https://" }); }}>
          <option value="url">A website link</option><option value="whatsapp">A WhatsApp chat</option><option value="contact">Contact details (vCard)</option><option value="upi">UPI payment details</option><option value="text">Plain text</option></Select>
        {kind === "url" && <Input label="Website link" value={f.url ?? ""} onChange={set("url")} inputMode="url" />}
        {kind === "text" && <Textarea label="Text" value={f.text ?? ""} onChange={set("text")} maxLength={1000} />}
        {kind === "whatsapp" && <><Input label="WhatsApp number with country code" placeholder="919876543210" value={f.phone ?? ""} onChange={set("phone")} inputMode="tel" /><Input label="Pre-filled message (optional)" value={f.message ?? ""} onChange={set("message")} maxLength={300} /></>}
        {kind === "contact" && <div className="grid gap-3 sm:grid-cols-2"><Input label="Name" value={f.name ?? ""} onChange={set("name")} /><Input label="Business (optional)" value={f.org ?? ""} onChange={set("org")} /><Input label="Phone" value={f.phone ?? ""} onChange={set("phone")} inputMode="tel" /><Input label="Email" value={f.email ?? ""} onChange={set("email")} type="email" /><Input className="sm:col-span-2" label="Website (optional)" value={f.website ?? ""} onChange={set("website")} /></div>}
        {kind === "upi" && <><Alert tone="warn">This encodes only your UPI ID and optional amount/note. <b>Scanning a QR code does not mean you have been paid</b> – always confirm in your bank or payment app.</Alert>
          <div className="grid gap-3 sm:grid-cols-2"><Input label="UPI ID" placeholder="name@bank" value={f.upiId ?? ""} onChange={set("upiId")} /><Input label="Payee name" value={f.payeeName ?? ""} onChange={set("payeeName")} /><Input label="Amount ₹ (optional)" inputMode="decimal" value={f.amount ?? ""} onChange={set("amount")} /><Input label="Note (optional)" value={f.note ?? ""} onChange={set("note")} /></div></>}
        <details className="rounded-xl border border-line bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Design options</summary>
          <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm">QR colour<input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="mt-1 block h-11 w-full rounded" /></label><label className="text-sm">Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 block h-11 w-full rounded" /></label>
            <Select label="Error correction" value={ec} onChange={(e) => setEc(e.target.value as any)} className="col-span-2"><option value="L">Low (smallest code)</option><option value="M">Medium (recommended)</option><option value="Q">Quartile</option><option value="H">High (most damage-tolerant)</option></Select></div>
          {(ratio < 4 || luminance(fg) > luminance(bg)) && <div className="mt-2"><Alert tone="warn">Low contrast or light-on-dark colours can stop phones from scanning. Use a dark code on a light background.</Alert></div>}</details>
      </div>
      <div className="space-y-4">
        <Card className="grid place-items-center p-6">
          {err ? <p role="alert" className="text-sm text-bad">{err}</p> : png ? <img src={png} alt="Generated QR code" className="h-64 w-64 max-w-full" /> : <p className="text-sm text-ink-2">Fill in the details to see your code.</p>}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!png} onClick={() => download(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg")}>Download SVG</Button>
          <Button variant="secondary" disabled={!png} onClick={async () => download(await (await fetch(png)).blob(), "qr-code.png")}>Download PNG (1024 px)</Button>
          <Button variant="secondary" disabled={!png || !mine.data?.canUsePoster} onClick={() => setPoster(true)}>Print poster {mine.data?.canUsePoster ? "" : "🔒"}</Button>
        </div>
        {!mine.data?.canUsePoster && <p className="text-xs text-ink-2">{user ? <>Poster templates are part of <Link className="underline" to="/tools/qr-business/about">paid plans</Link>.</> : <>Poster templates need a paid plan – <Link className="underline" to="/login">sign in</Link> first.</>}</p>}
        <Card className="p-4 text-sm"><h3 className="mb-1 text-base">Test before you print</h3><ul className="list-disc space-y-1 pl-5 text-ink-2"><li>Scan it with at least two different phones.</li><li>Print a small test first and scan from about 30 cm away.</li><li>Keep a clear blank border around the code and don't stretch it.</li></ul></Card>
      </div>
      {poster && png && (
        <div className="fixed inset-0 z-50 overflow-auto bg-ink/60 p-4" role="dialog" aria-modal="true" aria-label="Poster preview">
          <div className="mx-auto max-w-md">
            <div className="no-print mb-3 flex gap-2"><Button onClick={() => window.print()}>Print</Button><Button variant="secondary" onClick={() => setPoster(false)}>Close</Button><Input label="Heading" className="flex-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="print-area rounded-2xl bg-white p-10 text-center shadow-lift" style={{ aspectRatio: "210/297" }}><h2 className="font-display text-5xl font-semibold" style={{ color: fg }}>{title}</h2><img src={png} alt="QR code" className="mx-auto mt-10 w-4/5" /><p className="mt-6 text-sm text-ink-2">Point your phone camera at the code</p></div>
          </div>
        </div>)}
    </div>
  );
}

const emptyPage = { slug: "", businessName: "", tagline: "", about: "", phone: "", whatsapp: "", email: "", website: "", address: "", mapUrl: "", hours: "", upiId: "", services: [] as { name: string; price: string; description: string }[], accent: "#4f46e5", published: false };

function PageBuilder() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["page-mine"], queryFn: () => api<any>("/pages/mine"), enabled: !!user });
  const [p, setP] = useState(emptyPage); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [upgrade, setUpgrade] = useState(false);
  const [avail, setAvail] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const loaded = useRef(false);
  useEffect(() => { if (q.data?.page && !loaded.current) { loaded.current = true; setSlugTouched(true); setP({ ...emptyPage, ...q.data.page }); } }, [q.data]);
  useEffect(() => {
    if (!p.slug) return setAvail(null);
    if (!isValidSlug(p.slug)) return setAvail({ ok: false, msg: "Use 3–40 lowercase letters, numbers and single hyphens." });
    const t = setTimeout(async () => { const r = await api<any>(`/public/pages-available?slug=${p.slug}`).catch(() => null); setAvail(r ? { ok: r.available || q.data?.page?.slug === p.slug, msg: r.available || q.data?.page?.slug === p.slug ? "Available" : r.reason } : null); }, 350);
    return () => clearTimeout(t);
  }, [p.slug, q.data]);
  const set = (k: keyof typeof emptyPage) => (e: React.ChangeEvent<any>) => setP({ ...p, [k]: e.target.value });

  if (!user) return <Alert>Mini-business pages are saved to your account. <Link className="font-semibold underline" to="/login">Sign in</Link> or <Link className="font-semibold underline" to="/register">create a free account</Link> to build one.</Alert>;
  function check(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!p.businessName.trim()) e.businessName = "Enter your business name.";
    if (!isValidSlug(p.slug)) e.slug = "Use 3–40 lowercase letters, numbers and single hyphens (e.g. priya-salon).";
    else if (avail && !avail.ok) e.slug = avail.msg;
    for (const k of ["website", "mapUrl"] as const) if (p[k].trim()) { try { normalizeUrl(p[k]); } catch (x) { e[k] = (x as Error).message; } }
    if (p.whatsapp.trim() && !/^\d{8,15}$/.test(p.whatsapp.replace(/\D/g, ""))) e.whatsapp = "Include the country code, e.g. 919876543210.";
    if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = "Enter a valid email address.";
    if (p.upiId.trim() && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(p.upiId.trim())) e.upiId = "Enter a valid UPI ID, e.g. name@bank.";
    return e;
  }
  async function save(publish: boolean) {
    const problems = check(); setFe(problems);
    if (Object.keys(problems).length) { setErr("Please fix the highlighted fields."); setUpgrade(false); return; }
    setBusy(true); setErr(""); setUpgrade(false);
    try { const r = await api<any>("/pages/mine", { method: "PUT", body: { ...p, published: publish } }); setP({ ...emptyPage, ...r.page }); qc.invalidateQueries({ queryKey: ["page-mine"] }); toast(publish ? "Published" : "Draft saved"); }
    catch (e) { if (e instanceof ApiError && e.status === 402) setUpgrade(true); setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const svc = (i: number, k: "name" | "price" | "description") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, services: p.services.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Input label="Business name" value={p.businessName} error={fe.businessName} onChange={(e) => setP({ ...p, businessName: e.target.value, slug: slugTouched ? p.slug : slugify(e.target.value) })} />
        <div><Input label="Page address" value={p.slug} error={fe.slug} onChange={(e) => { setSlugTouched(true); setP({ ...p, slug: e.target.value.toLowerCase() }); }} hint={`${location.origin}/p/${p.slug || "your-name"}`} />{avail && <p className={cx("mt-1 text-xs font-medium", avail.ok ? "text-ok" : "text-bad")} aria-live="polite">{avail.msg}</p>}</div>
        <Input label="Tagline" value={p.tagline} onChange={set("tagline")} /><Textarea label="About" value={p.about} onChange={set("about")} />
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Phone" inputMode="tel" value={p.phone} onChange={set("phone")} /><Input label="WhatsApp (with country code)" inputMode="tel" value={p.whatsapp} error={fe.whatsapp} onChange={set("whatsapp")} /><Input label="Email" type="email" value={p.email} error={fe.email} onChange={set("email")} /><Input label="Website" value={p.website} error={fe.website} onChange={set("website")} /></div>
        <Textarea label="Address" rows={2} value={p.address} onChange={set("address")} /><Input label="Map link (optional)" value={p.mapUrl} error={fe.mapUrl} onChange={set("mapUrl")} /><Textarea label="Opening hours" rows={2} value={p.hours} onChange={set("hours")} placeholder={"Mon–Sat 9am–7pm"} />
        <Input label="UPI ID shown on page (optional)" value={p.upiId} error={fe.upiId} onChange={set("upiId")} hint="Only the ID is shown – never put secrets or card details here." />
        <label className="flex items-center gap-3 text-sm">Accent colour <input aria-label="Accent colour" type="color" value={p.accent} onChange={set("accent")} className="h-10 w-14 rounded" /></label>
        <fieldset className="space-y-2"><legend className="font-medium">Services & products</legend>
          {p.services.map((s, i) => <div key={i} className="grid grid-cols-[1fr_90px_auto] items-end gap-2"><Input label={`Name ${i + 1}`} value={s.name} onChange={svc(i, "name")} /><Input label="Price" value={s.price} onChange={svc(i, "price")} /><Button variant="ghost" aria-label={`Remove service ${i + 1}`} onClick={() => setP({ ...p, services: p.services.filter((_, j) => j !== i) })}>✕</Button></div>)}
          {p.services.length < 20 && <Button variant="secondary" onClick={() => setP({ ...p, services: [...p.services, { name: "", price: "", description: "" }] })}>+ Add service</Button>}</fieldset>
        {err && <Alert tone={upgrade ? "warn" : "bad"}>{err} {upgrade && <LinkButton to="/tools/qr-business/about" className="mt-2">See hosted page plan</LinkButton>}</Alert>}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button><Button loading={busy} onClick={() => save(true)} disabled={!q.data?.canPublish && false}>Publish</Button></div>
        {q.data?.page?.published && <p className="text-sm">Live at <Link className="font-semibold text-brand underline" to={`/p/${q.data.page.slug}`}>/p/{q.data.page.slug}</Link> {q.data.expiresAt && <Badge>hosted until {new Date(q.data.expiresAt).toLocaleDateString("en-IN")}</Badge>}</p>}
        {!q.data?.canPublish && <p className="text-xs text-ink-2">Previewing and saving drafts is free. Publishing a public page needs the hosted business page plan (₹199/year).</p>}
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start"><p className="mb-2 text-sm font-semibold text-ink-2">Preview {p.published ? "" : "(not published)"}</p><BusinessPageView page={p} /></div>
    </div>
  );
}
