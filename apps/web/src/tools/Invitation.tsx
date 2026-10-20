import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invitationSchema, type InvitationInput } from "@ek/shared";
import "@fontsource/noto-sans-oriya/400.css";
import "@fontsource/noto-sans-oriya/500.css";
import "@fontsource/noto-sans-oriya/600.css";
import "@fontsource/noto-sans/400.css";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "../components/ui";
import { useToast } from "../components/toast";
import { api, errMsg, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAccess } from "../lib/data";
import { download } from "../lib/format";
import { DEFAULTS, SIZES, drawInvitation, type Background } from "./invitationRender";

const blank = (): InvitationInput => ({ title: "My invitation", occasion: "birthday", language: "en", layout: "centered", fields: { heading: "", names: "", date: "", time: "", venue: "", contact: "", message: "" }, colours: { background: "#fffaf0", text: "#2b2118", accent: "#be185d" } });

export default function Invitation() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const access = useAccess().get("invitation"); const credits = access?.credits ?? 0;
  const [d, setD] = useState<InvitationInput>(blank());
  const [bgKind, setBgKind] = useState<"solid" | "gradient" | "dots" | "image">("gradient");
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null);
  const [ai, setAi] = useState<{ options: string[]; notice: string } | null>(null); const [aiErr, setAiErr] = useState(""); const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ["invitations"], queryFn: () => api<{ items: any[]; aiEnabled: boolean }>("/invitations"), enabled: !!user });

  const bg = useCallback((): Background => (bgKind === "image" && img ? { kind: "image", img } : bgKind === "image" ? { kind: "solid" } : { kind: bgKind }), [bgKind, img]);
  useEffect(() => { Promise.all(["400 40px 'Noto Sans Oriya'", "500 40px 'Noto Sans Oriya'", "600 40px 'Noto Sans Oriya'", "600 40px Fraunces", "400 40px Inter"].map((f) => document.fonts.load(f, "ଅକ Aa").catch(() => []))).then(() => setFontsReady((n) => n + 1)); }, []);
  useEffect(() => { if (preview.current) drawInvitation(preview.current, d, bg(), 540, 764, true); }, [d, bg, fontsReady]);

  const setF = (k: keyof InvitationInput["fields"]) => (e: React.ChangeEvent<any>) => setD({ ...d, fields: { ...d.fields, [k]: e.target.value } });
  const setC = (k: keyof InvitationInput["colours"]) => (e: React.ChangeEvent<any>) => setD({ ...d, colours: { ...d.colours, [k]: e.target.value } });
  const valid = invitationSchema.safeParse(d);
  const missing = !d.fields.names.trim() || !d.fields.date.trim() || !d.fields.venue.trim();

  async function render(size: keyof typeof SIZES, watermark: boolean) {
    const c = document.createElement("canvas"); drawInvitation(c, d, bg(), SIZES[size].w, SIZES[size].h, watermark);
    return c;
  }
  async function exportAs(kind: "png" | "pdf", size: keyof typeof SIZES, clean: boolean) {
    setBusy(true);
    try {
      if (clean) {
        if (!user) throw new Error("Sign in to download without the watermark.");
        try { await api("/entitlements/spend", { body: { product: "invitation" } }); qc.invalidateQueries({ queryKey: ["access"] }); }
        catch (e) { if (e instanceof ApiError && e.status === 402) throw new Error("You have no clean-download credits left. Buy a pack, or download the watermarked version free."); throw e; }
      }
      await Promise.all(["400 40px 'Noto Sans Oriya'", "600 40px Fraunces", "400 40px Inter"].map((f) => document.fonts.load(f, "ଅକ Aa")));
      const c = await render(size, !clean);
      const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Export failed"))), "image/png"));
      const name = `${(d.title || "invitation").replace(/[^\w-]+/g, "-")}${clean ? "" : "-preview"}`;
      if (kind === "png") download(blob, `${name}.png`);
      else {
        const pdf = await PDFDocument.create(); const page = pdf.addPage([419.53, 595.28]); // A5
        const png = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer())); page.drawImage(png, { x: 0, y: 0, width: 419.53, height: 595.28 });
        download(new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
      }
      toast(clean ? "Downloaded (1 credit used)" : "Downloaded with watermark");
    } catch (e) { toast(errMsg(e), "bad"); } finally { setBusy(false); }
  }
  const save = useMutation({
    mutationFn: () => (savedId ? api(`/invitations/${savedId}`, { method: "PUT", body: d }) : api<any>("/invitations", { body: d })),
    onSuccess: (r: any) => { if (r?.item) setSavedId(r.item.id); qc.invalidateQueries({ queryKey: ["invitations"] }); toast("Design saved"); }, onError: (e) => toast(errMsg(e), "bad"),
  });
  async function suggest() {
    setAiBusy(true); setAiErr(""); setAi(null);
    try { setAi(await api("/invitations/ai", { body: { occasion: d.occasion, language: d.language, names: d.fields.names, text: d.fields.message } })); } catch (e) { setAiErr(errMsg(e)); } finally { setAiBusy(false); }
  }
  async function pickImage(f?: File) {
    if (!f) return; if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024) return toast("Choose a JPEG, PNG or WebP under 15 MB", "bad");
    try { setImg(await createImageBitmap(f)); setBgKind("image"); } catch { toast("That image could not be read", "bad"); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
      <div className="space-y-4">
        <Alert tone="warn">Please <b>double-check every name, date, address and translation</b> before sharing. Regional-language text, especially anything suggested by AI, should be read by a fluent speaker.</Alert>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Occasion" value={d.occasion} onChange={(e) => setD({ ...d, occasion: e.target.value as any })}>{Object.keys(DEFAULTS).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}</Select>
          <Select label="Language" value={d.language} onChange={(e) => setD({ ...d, language: e.target.value as any })}><option value="en">English</option><option value="or">ଓଡ଼ିଆ (Odia)</option></Select>
          <Select label="Layout" value={d.layout} onChange={(e) => setD({ ...d, layout: e.target.value as any })}><option value="centered">Centred</option><option value="left">Left-aligned</option><option value="frame">Double frame</option></Select>
        </div>
        <Input label="Heading (leave blank for the default)" placeholder={DEFAULTS[d.occasion][d.language]} value={d.fields.heading} onChange={setF("heading")} maxLength={80} />
        <Input label="Names" value={d.fields.names} onChange={setF("names")} maxLength={100} hint="Required" lang={d.language === "or" ? "or" : "en"} />
        <div className="grid gap-3 sm:grid-cols-2"><Input label="Date" value={d.fields.date} onChange={setF("date")} maxLength={40} placeholder="e.g. 14 Nov 2026" /><Input label="Time" value={d.fields.time} onChange={setF("time")} maxLength={30} placeholder="e.g. 6:30 PM" /></div>
        <Input label="Venue" value={d.fields.venue} onChange={setF("venue")} maxLength={160} /><Input label="Contact" value={d.fields.contact} onChange={setF("contact")} maxLength={80} />
        <Textarea label="Message (optional)" value={d.fields.message} onChange={setF("message")} maxLength={240} rows={3} />
        <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" loading={aiBusy} disabled={!user} onClick={suggest}>Suggest wording (AI)</Button><span className="text-xs text-ink-2">{user ? "Optional. You can always edit the result." : "Sign in to use AI suggestions (optional)."}</span></div>
        {aiErr && <Alert tone="warn">{aiErr}</Alert>}
        {ai && <Card className="space-y-2 p-4"><Badge tone="brand">AI-generated – review before use</Badge><p className="text-xs text-ink-2">{ai.notice}</p>{ai.options.map((o) => <button key={o} className="block w-full rounded-xl border border-line bg-paper p-3 text-left text-sm hover:border-brand" onClick={() => setD({ ...d, fields: { ...d.fields, message: o.slice(0, 240) } })}>{o}</button>)}</Card>}
        <fieldset className="grid grid-cols-3 gap-3"><legend className="mb-1 text-sm font-medium">Colours</legend>
          {([["background", "Background"], ["text", "Text"], ["accent", "Accent"]] as const).map(([k, l]) => <label key={k} className="text-sm">{l}<input type="color" value={d.colours[k]} onChange={setC(k)} className="mt-1 block h-11 w-full rounded" /></label>)}</fieldset>
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Background style" value={bgKind} onChange={(e) => setBgKind(e.target.value as any)}><option value="solid">Plain</option><option value="gradient">Soft gradient</option><option value="dots">Dots</option><option value="image">My own image</option></Select>
          {bgKind === "image" && <div><label htmlFor="bgimg" className="mb-1 block text-sm font-medium">Background image</label><input id="bgimg" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickImage(e.target.files?.[0])} className="block w-full text-sm" /><p className="mt-1 text-xs text-ink-2">Only use images you own or have rights to. It stays on your device.</p></div>}</div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <canvas ref={preview} role="img" aria-label="Invitation preview" className="w-full rounded-2xl border border-line bg-white shadow-lift" style={{ aspectRatio: "1080/1528" }} />
        {missing && <Alert tone="warn">Names, date and venue are empty – fill them in so guests know what to expect.</Alert>}
        <Card className="space-y-3 p-4">
          <h2 className="text-lg">Download</h2>
          <p className="text-xs text-ink-2">Free downloads carry a small watermark. Clean downloads use one credit {user ? <>(you have <b>{credits}</b>)</> : null}.</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} onClick={() => exportAs("png", "screen", false)}>PNG · free</Button><Button variant="secondary" loading={busy} onClick={() => exportAs("pdf", "print", false)}>PDF · free</Button></div>
          <div className="flex flex-wrap gap-2"><Button loading={busy} disabled={!valid.success} onClick={() => exportAs("png", "print", true)}>Clean PNG</Button><Button loading={busy} disabled={!valid.success} onClick={() => exportAs("pdf", "print", true)}>Clean PDF</Button></div>
          <p className="text-xs text-ink-2">PNG: {SIZES.screen.label} (free) / {SIZES.print.label} (clean). PDF: A5 page.</p>
          {user && credits < 1 && <p className="text-sm"><Link className="font-semibold text-brand underline" to="/tools/invitation/about">Buy a clean-download pack</Link></p>}
          {!user && <p className="text-sm"><Link className="font-semibold text-brand underline" to="/login">Sign in</Link> to save designs and buy clean downloads.</p>}
        </Card>
        {user && <Card className="space-y-2 p-4"><div className="flex items-center justify-between"><h2 className="text-lg">Saved designs</h2><Button variant="secondary" loading={save.isPending} disabled={!valid.success} onClick={() => save.mutate()}>{savedId ? "Update" : "Save"}</Button></div>
          <Input label="Design name" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <ul className="space-y-1 text-sm">{list.data?.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><button className="truncate text-left underline" onClick={() => { setD(invitationSchema.parse(i.data)); setSavedId(i.id); }}>{i.title}</button><button aria-label={`Delete ${i.title}`} className="text-bad" onClick={async () => { await api(`/invitations/${i.id}`, { method: "DELETE" }); if (savedId === i.id) setSavedId(null); qc.invalidateQueries({ queryKey: ["invitations"] }); }}>✕</button></li>)}</ul></Card>}
      </div>
    </div>
  );
}
