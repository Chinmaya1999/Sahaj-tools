import { useState } from "react";
import { normalizeUrl } from "@ek/shared";

export interface PageData { slug: string; businessName: string; tagline?: string; about?: string; phone?: string; whatsapp?: string; email?: string; website?: string; address?: string; mapUrl?: string; hours?: string; upiId?: string; services?: { name?: string; price?: string; description?: string }[]; accent?: string }

/** Renders user content as React text nodes only (auto-escaped); links are re-validated to http(s)/tel/mailto before rendering. */
export function BusinessPageView({ page: p }: { page: PageData }) {
  const accent = /^#[0-9a-f]{6}$/i.test(p.accent ?? "") ? p.accent! : "#4f46e5";
  const [copied, setCopied] = useState(false);
  const safe = (u?: string) => { if (!u) return ""; try { return normalizeUrl(u); } catch { return ""; } };
  const tel = (p.phone ?? "").replace(/[^\d+]/g, "");
  const wa = (p.whatsapp ?? "").replace(/\D/g, "");
  const web = safe(p.website), map = safe(p.mapUrl);
  const btn = "flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white";
  return (
    <article className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-line bg-card shadow-soft">
      <header className="px-6 py-8 text-white" style={{ background: accent }}>
        <h1 className="font-display text-3xl font-semibold" style={{ overflowWrap: "anywhere" }}>{p.businessName || "Your business"}</h1>
        {p.tagline && <p className="mt-1 opacity-90">{p.tagline}</p>}
      </header>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-2">
          {tel && <a className={btn} style={{ background: accent }} href={`tel:${tel}`}>Call</a>}
          {wa && <a className={btn} style={{ background: "#128c4a" }} href={`https://wa.me/${wa}`} rel="noopener noreferrer">WhatsApp</a>}
          {p.email && <a className={btn} style={{ background: "#334155" }} href={`mailto:${p.email}`}>Email</a>}
          {web && <a className={btn} style={{ background: "#334155" }} href={web} rel="noopener noreferrer nofollow">Website</a>}
        </div>
        {p.about && <section><h2 className="text-xl">About</h2><p className="mt-1 whitespace-pre-line text-ink-2" style={{ overflowWrap: "anywhere" }}>{p.about}</p></section>}
        {!!p.services?.filter((s) => s.name).length && (
          <section><h2 className="text-xl">Services & products</h2>
            <ul className="mt-2 divide-y divide-line">{p.services!.filter((s) => s.name).map((s, i) => <li key={i} className="py-2"><div className="flex justify-between gap-3"><span className="font-medium">{s.name}</span><span className="shrink-0 font-semibold">{s.price}</span></div>{s.description && <p className="text-sm text-ink-2">{s.description}</p>}</li>)}</ul></section>)}
        {p.hours && <section><h2 className="text-xl">Opening hours</h2><p className="mt-1 whitespace-pre-line text-ink-2">{p.hours}</p></section>}
        {(p.address || map) && <section><h2 className="text-xl">Find us</h2>{p.address && <p className="mt-1 text-ink-2">{p.address}</p>}{map && <a className="mt-1 inline-block font-semibold underline" style={{ color: accent }} href={map} rel="noopener noreferrer nofollow">Open map</a>}</section>}
        {p.upiId && <section><h2 className="text-xl">Pay by UPI</h2><p className="mt-1 text-sm text-ink-2">Pay this UPI ID from your payment app, then confirm with the business.</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-paper p-3"><code className="break-all text-sm">{p.upiId}</code><button className="min-h-9 rounded-lg border border-line bg-white px-3 text-sm" onClick={() => { navigator.clipboard?.writeText(p.upiId!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button></div></section>}
      </div>
    </article>
  );
}
