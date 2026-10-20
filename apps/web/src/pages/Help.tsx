import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, Input, LinkButton, Empty } from "../components/ui";
import { Chip, PageHero, TileArt } from "../components/PageHero";

export const FAQ_ITEMS: { q: string; a: string; cat?: string }[] = [
  { cat: "Getting started", q: "Do I have to pay to try a tool?", a: "No. Every tool has a free way to try it. PDF, photo, QR and invitation tools need no account at all; invoices, resumes and inventory need a free account because they save your work." },
  { cat: "Privacy & data", q: "Are my PDFs and photos uploaded?", a: "No. The PDF, photo and invitation tools run inside your browser, so those files never leave your device. Only things that must be saved (like invoices, stock and resumes) are stored on our servers, tied to your account." },
  { cat: "Payments", q: "Does anything renew automatically?", a: "No. 30-day and yearly plans simply end on their expiry date; you choose whether to buy again. Credit packs do not expire." },
  { cat: "Payments", q: "How do payments work?", a: "Payments are handled by our payment provider. Our server confirms each payment with a cryptographic signature before unlocking anything. We never see or store card details." },
  { cat: "Using the tools", q: "Will my invoice be accepted for GST or tax filing?", a: "The invoice tool calculates amounts and lets you add your tax details, but we cannot guarantee a document meets every legal or tax requirement. Please check the rules that apply to your business or ask an accountant." },
  { cat: "Using the tools", q: "Will my photo be accepted by an exam or government portal?", a: "We cannot promise that. Presets show the typical requirements, but portals change them – always check the size, format and file-size limits in the official instructions." },
  { cat: "Using the tools", q: "Are expiry alerts sent to me?", a: "Not yet. Expiring and expired products are highlighted inside the app each time you open it. Email or WhatsApp notifications are not available." },
  { cat: "Payments", q: "Can I get a refund?", a: "See our refund policy. In short: if something does not work as described, contact support and we will help or refund." },
  { cat: "Privacy & data", q: "How do I delete my data?", a: "Go to Account → Settings. You can download everything we hold about you and permanently delete your account." },
  { cat: "Using the tools", q: "Is the AI assistance required?", a: "No. Every tool works fully without AI. Where AI suggestions are offered, they are labelled and you review and edit them; they may be unavailable at times." },
];

export function FAQ({ items }: { items: typeof FAQ_ITEMS }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-card">
      {items.map((it, i) => (
        <div key={it.q}>
          <h3 className="font-sans text-base"><button className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>{it.q}<span aria-hidden>{open === i ? "−" : "+"}</span></button></h3>
          <div id={`faq-${i}`} hidden={open !== i} className="px-4 pb-4 text-sm text-ink-2">{it.a}</div>
        </div>
      ))}
    </div>
  );
}

const CATS = ["Getting started", "Payments", "Using the tools", "Privacy & data"];

export default function Help() {
  const [q, setQ] = useState(""); const [cat, setCat] = useState("all");
  const items = FAQ_ITEMS.filter((i) => (cat === "all" || i.cat === cat) && (!q.trim() || `${i.q} ${i.a}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <PageHero eyebrow="Support" title="Help centre" sub="Quick answers about tools, payments and your data. Can't find it? Our team replies by email." art={<TileArt icons={["💬", "❓", "🛟"]} />}>
        <div className="max-w-md"><Input label="Search help" type="search" placeholder="e.g. refund, PDF, invoice…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </PageHero>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="grid gap-3 sm:grid-cols-3">
          {[["💬", "Contact support", "Tell us what happened", "/contact"], ["↩️", "Refund policy", "How refunds work", "/refunds"], ["🔐", "Privacy & account", "Export or delete your data", "/account/settings"]].map(([i, t, d, to]) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"><span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-xl">{i}</span><span><b className="block">{t}</b><span className="text-sm text-ink-2">{d}</span></span></Link>
          ))}
        </div>
        <div role="group" aria-label="Help topics" className="mt-8 flex gap-2 overflow-x-auto pb-1"><Chip active={cat === "all"} onClick={() => setCat("all")}>All topics</Chip>{CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
        <div className="mt-4" aria-live="polite">{items.length ? <FAQ key={`${cat}-${q}`} items={items} /> : <Empty title="No answers match that search">Try different words, or <Link className="font-semibold text-brand underline" to="/contact">ask our team</Link>.</Empty>}</div>
        <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 bg-ink p-6 text-white"><div><h2 className="text-2xl">Still need help?</h2><p className="text-white/80">Send us a message and include your order number if it is about a payment.</p></div><LinkButton to="/contact" className="bg-white !text-ink hover:bg-paper-2">Contact support</LinkButton></Card>
      </div>
    </>
  );
}
