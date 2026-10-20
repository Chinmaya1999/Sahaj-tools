import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PRODUCTS, BUNDLES, PLANS, formatInr, type ProductSlug } from "@ek/shared";
import { Badge, Card, Empty, Input, LinkButton, Reveal } from "../components/ui";
import { ProductCard } from "../components/ProductCard";
import { ProductArt } from "../components/Art";
import { Chip, PageHero, TileArt } from "../components/PageHero";
import { useCatalog } from "../lib/data";

const GROUPS: { id: string; label: string; slugs: ProductSlug[] }[] = [
  { id: "business", label: "For my business", slugs: ["invoice", "inventory", "qr-business"] },
  { id: "career", label: "For jobs & study", slugs: ["resume", "photo-tools", "pdf-tools"] },
  { id: "files", label: "Files & photos", slugs: ["pdf-tools", "photo-tools"] },
  { id: "events", label: "Events & sharing", slugs: ["invitation", "qr-business"] },
];

export function Explore() {
  const cat = useCatalog(); const reduce = useReducedMotion();
  const [group, setGroup] = useState("all"); const [q, setQ] = useState("");
  const list = (cat.data?.products ?? PRODUCTS).filter((p) => {
    const inGroup = group === "all" || GROUPS.find((g) => g.id === group)!.slugs.includes(p.slug);
    const text = `${p.name} ${p.problem} ${p.audience} ${p.features.join(" ")}`.toLowerCase();
    return inGroup && (!q.trim() || text.includes(q.trim().toLowerCase()));
  });
  return (
    <>
      <PageHero eyebrow="Tools" title="Seven tools. One small problem each." sub="Pick the job you need done. Every tool has a free way to start, shows its real price up front, and works on your phone." art={<TileArt icons={["🧾", "📦", "📄", "🔳", "🖼️", "💌"]} />}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-72"><Input label="Search tools" placeholder="e.g. invoice, photo, QR…" value={q} onChange={(e) => setQ(e.target.value)} type="search" /></div>
        </div>
        <div role="group" aria-label="Filter tools" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Chip active={group === "all"} onClick={() => setGroup("all")} count={PRODUCTS.length}>All tools</Chip>
          {GROUPS.map((g) => <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)} count={g.slugs.length}>{g.label}</Chip>)}
        </div>
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="mb-4 text-sm text-ink-2" aria-live="polite">Showing {list.length} of {PRODUCTS.length} tools</p>
        {list.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{list.map((p, i) => <motion.div key={p.slug} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.05, duration: 0.35 }}><ProductCard product={p} /></motion.div>)}</div>
          : <Empty title="No tool matches that search"><button className="font-semibold text-brand underline" onClick={() => { setQ(""); setGroup("all"); }}>Clear filters</button></Empty>}
        <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 bg-ink p-6 text-white"><div><h2 className="text-2xl">Not sure where to start?</h2><p className="text-white/80">See which everyday problem each tool fixes, with examples.</p></div><LinkButton to="/#problem-h" className="bg-white !text-ink hover:bg-paper-2">See common problems</LinkButton></Card>
      </div>
    </>
  );
}

export function FreeTools() {
  const cat = useCatalog();
  const plans = cat.data?.plans ?? PLANS.map((p) => ({ ...p, active: true }));
  const noAccount: ProductSlug[] = ["pdf-tools", "photo-tools", "qr-business", "invitation"];
  const card = (slug: ProductSlug) => {
    const p = PRODUCTS.find((x) => x.slug === slug)!;
    const paid = plans.filter((x) => x.product === slug && x.kind !== "free" && x.active);
    const from = paid.length ? Math.min(...paid.map((x) => x.pricePaise)) : 0;
    return (
      <Card key={slug} className="flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
        <ProductArt slug={slug} accent={p.accent} />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-2"><h3 className="text-xl">{p.icon} {p.name}</h3></div>
          <p className="mt-2 text-sm text-ink-2">{p.problem}</p>
          <p className="mt-3 rounded-xl bg-ok-bg px-3 py-2 text-sm font-medium text-ok">Free: {p.free}</p>
          {from > 0 && <p className="mt-2 text-xs text-ink-2">Need more later? Paid options start at <b className="text-ink">{formatInr(from)}</b>.</p>}
          <div className="mt-auto flex gap-2 pt-4"><LinkButton to={`/tools/${slug}`} className="flex-1">Open free tool</LinkButton><LinkButton to={`/tools/${slug}/about`} variant="secondary">Details</LinkButton></div>
        </div>
      </Card>
    );
  };
  const withAccount = PRODUCTS.filter((p) => !noAccount.includes(p.slug)).map((p) => p.slug);
  return (
    <>
      <PageHero eyebrow="Free tools" title="Start free. No card, no catch." sub="Four tools work right now with no account at all. Three more are free once you sign up, because they save your work." art={<TileArt icons={["🗂️", "🖼️", "🔳"]} />}>
        <div className="flex flex-wrap gap-2 text-sm font-semibold"><Badge tone="ok">No credit card</Badge><Badge tone="ok">Files stay on your device</Badge><Badge tone="ok">Nothing renews automatically</Badge></div>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        <section aria-labelledby="na-h"><div className="mb-4 flex items-center gap-3"><h2 id="na-h" className="text-2xl sm:text-3xl">Use now, no account needed</h2><Badge tone="brand">{noAccount.length} tools</Badge></div><div className="grid gap-5 md:grid-cols-2">{noAccount.map(card)}</div></section>
        <section aria-labelledby="wa-h"><div className="mb-1 flex items-center gap-3"><h2 id="wa-h" className="text-2xl sm:text-3xl">Free with a free account</h2><Badge>{withAccount.length} tools</Badge></div><p className="mb-4 text-ink-2">These save your invoices, stock and resumes, so they need a sign-in. <Link to="/register" className="font-semibold text-brand underline">Create your free account</Link>.</p><div className="grid gap-5 md:grid-cols-3">{withAccount.map(card)}</div></section>
      </div>
    </>
  );
}

const BEST_FOR: Record<string, { who: string; icon: string }> = {
  "bundle-student": { who: "Students and job seekers who need a polished resume, clean PDFs and correctly sized photos.", icon: "🎓" },
  "bundle-shop": { who: "Shops and service businesses that bill customers and keep stock.", icon: "🏪" },
};

export function Bundles() {
  const cat = useCatalog();
  const bundles = cat.data?.bundles ?? BUNDLES.map((b) => ({ ...b, active: true }));
  const planList = cat.data?.plans ?? [];
  return (
    <>
      <PageHero eyebrow="Bundles" title="Buy together, pay less." sub="Each bundle is a single payment for the exact plans listed. No auto-renewal, no extras." art={<TileArt icons={["🎓", "🏪", "🎁"]} />}>
        <p className="text-sm text-ink-2">Have a promo code? You can enter it at checkout.</p>
      </PageHero>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 md:grid-cols-2">
        {bundles.map((b) => {
          const items = b.planIds.map((id) => planList.find((p) => p.id === id)).filter(Boolean) as typeof planList;
          const sum = items.reduce((a, p) => a + p.pricePaise, 0); const save = sum - b.pricePaise; const best = BEST_FOR[b.id];
          return (
            <Reveal key={b.id}>
              <Card className="relative flex h-full flex-col overflow-hidden p-0">
                <div className="bg-gradient-to-br from-brand-50 to-paper-2 p-6">
                  <div className="flex items-start justify-between gap-3"><span aria-hidden className="text-4xl">{best?.icon ?? "🎁"}</span>{save > 0 && <Badge tone="ok">Save {formatInr(save)}</Badge>}</div>
                  <h2 className="mt-3 text-3xl">{b.name}</h2><p className="mt-1 text-ink-2">{b.blurb}</p>
                  {best && <p className="mt-2 text-sm"><b>Best for:</b> {best.who}</p>}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-ink-2">What is included</h3>
                  <ul className="mt-3 space-y-2">{items.map((p) => <li key={p.id} className="flex items-start justify-between gap-3 text-sm"><span><span aria-hidden>✓ </span><b>{PRODUCTS.find((x) => x.slug === p.product)?.name.split(" & ")[0]}</b> – {p.name}<span className="block pl-5 text-xs text-ink-2">{p.blurb}</span></span><span className="shrink-0 text-ink-2 line-through decoration-ink-2/50">{formatInr(p.pricePaise)}</span></li>)}</ul>
                  <div className="mt-auto border-t border-line pt-5"><div className="flex items-end justify-between"><div><p className="text-xs text-ink-2">One payment</p><p className="text-4xl font-semibold">{formatInr(b.pricePaise)}</p></div>{sum > b.pricePaise && <p className="text-sm text-ink-2">worth {formatInr(sum)} separately</p>}</div>
                    <LinkButton to={`/checkout/bundle/${b.id}`} className="mt-4 w-full text-base" aria-disabled={!b.active}>{b.active ? `Get ${b.name}` : "Unavailable"}</LinkButton></div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-10"><Card className="p-5 text-sm text-ink-2"><b className="text-ink">Good to know:</b> bundled 30-day plans start when you pay and simply end after 30 days. Refunded orders lose access. See the <Link className="font-semibold text-brand underline" to="/refunds">refund policy</Link>.</Card></div>
    </>
  );
}
