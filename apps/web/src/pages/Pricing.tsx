import { useState } from "react";
import { Link } from "react-router-dom";
import { BUNDLES, PRODUCTS, formatInr, type ProductSlug } from "@ek/shared";
import { Badge, Card, LinkButton, Reveal, Table, Td, Th, cx } from "../components/ui";
import { Chip, PageHero, TileArt } from "../components/PageHero";
import { useCatalog } from "../lib/data";

/** Compact comparison table (also used on the home page). */
export function PricingTable({ compact }: { compact?: boolean }) {
  const cat = useCatalog();
  const plans = cat.data?.plans ?? [];
  return (
    <Table label="Free and paid features by product">
      <thead><tr><Th>Tool</Th><Th>Free</Th><Th>Paid options</Th>{!compact && <Th>Billing</Th>}</tr></thead>
      <tbody>
        {PRODUCTS.map((p) => {
          const free = plans.find((x) => x.product === p.slug && x.kind === "free");
          const paid = plans.filter((x) => x.product === p.slug && x.kind !== "free");
          return (
            <tr key={p.slug}>
              <Td><Link className="font-semibold hover:underline" to={`/tools/${p.slug}/about`}>{p.icon} {p.name}</Link></Td>
              <Td>{free?.blurb ?? p.free}</Td>
              <Td><ul className="space-y-1">{paid.map((x) => <li key={x.id}><b>{formatInr(x.pricePaise)}</b> – {x.name}{!x.active && <span className="text-ink-2"> (unavailable)</span>}{compact ? "" : <span className="block text-xs text-ink-2">{x.blurb}</span>}</li>)}</ul></Td>
              {!compact && <Td><ul className="space-y-1 text-xs text-ink-2">{paid.map((x) => <li key={x.id}>{x.billing}</li>)}</ul></Td>}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default function Pricing() {
  const cat = useCatalog();
  const [only, setOnly] = useState<"all" | ProductSlug>("all");
  const plans = cat.data?.plans ?? [];
  const shown = PRODUCTS.filter((p) => only === "all" || p.slug === only);
  const kindLabel = (k: string, days?: number) => (k === "free" ? "Free forever" : k === "credits" ? "One-time pack" : k === "one_time" ? "Pay once" : days && days >= 365 ? "1 year" : `${days ?? 30} days`);
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple, honest pricing." sub="Prices in Indian rupees. Nothing renews automatically. The exact amount is always shown before you pay." art={<TileArt icons={["₹", "✅", "🔒"]} />}>
        <ul className="flex flex-wrap gap-2 text-sm font-semibold"><li><Badge tone="ok">No auto-renewal</Badge></li><li><Badge tone="ok">No hidden charges</Badge></li><li><Badge tone="ok">Refunds if it doesn't work</Badge></li></ul>
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div role="group" aria-label="Choose a tool" className="mb-8 flex gap-2 overflow-x-auto pb-1">
          <Chip active={only === "all"} onClick={() => setOnly("all")}>All tools</Chip>
          {PRODUCTS.map((p) => <Chip key={p.slug} active={only === p.slug} onClick={() => setOnly(p.slug)}><span aria-hidden>{p.icon}</span> {p.name.split(" & ")[0].replace("Regional-Language ", "").replace(" Maker", "")}</Chip>)}
        </div>
        <div className="space-y-10">
          {shown.map((p) => {
            const list = plans.filter((x) => x.product === p.slug);
            return (
              <Reveal key={p.slug}>
                <section aria-labelledby={`pp-${p.slug}`}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id={`pp-${p.slug}`} className="text-2xl"><span aria-hidden>{p.icon}</span> {p.name}</h2><Link className="text-sm font-semibold text-brand underline" to={`/tools/${p.slug}/about`}>What's included</Link></div>
                  <div className={cx("grid gap-4", list.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
                    {list.map((pl, i) => {
                      const featured = pl.kind !== "free" && i === list.length - 1 && list.length >= 3;
                      return (
                        <Card key={pl.id} className={cx("relative flex flex-col p-5", featured && "border-2 border-brand shadow-lift")}>
                          {featured && <span className="absolute -top-3 left-4 rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-(--color-on-brand)">Most complete</span>}
                          <div className="flex items-center justify-between"><h3 className="text-xl">{pl.name}</h3><Badge tone={pl.kind === "free" ? "ok" : "neutral"}>{kindLabel(pl.kind, pl.periodDays)}</Badge></div>
                          <p className="mt-3 text-4xl font-semibold">{pl.kind === "free" ? "₹0" : formatInr(pl.pricePaise)}</p>
                          <p className="text-xs text-ink-2">{pl.billing}</p>
                          <p className="mt-3 flex-1 text-sm text-ink-2">{pl.blurb}</p>
                          {pl.kind === "free" ? <LinkButton to={`/tools/${p.slug}`} variant="secondary" className="mt-4">Start free</LinkButton>
                            : <LinkButton to={`/checkout/plan/${pl.id}`} variant={featured ? "primary" : "secondary"} className="mt-4" aria-disabled={!pl.active}>{pl.active ? `Buy for ${formatInr(pl.pricePaise)}` : "Unavailable"}</LinkButton>}
                        </Card>
                      );
                    })}
                  </div>
                </section>
              </Reveal>
            );
          })}
        </div>

        <h2 className="mb-3 mt-14 text-2xl sm:text-3xl">Or save with a bundle</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {BUNDLES.map((b) => <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand-50 to-card p-5"><div><Badge tone="brand">Bundle</Badge><h3 className="mt-2 text-xl">{b.name}</h3><p className="text-sm text-ink-2">{b.blurb}</p></div><div className="text-right"><p className="text-3xl font-semibold">{formatInr(b.pricePaise)}</p><LinkButton to={`/checkout/bundle/${b.id}`} className="mt-2">Buy bundle</LinkButton></div></Card>)}
        </div>

        <details className="mt-12 rounded-2xl border border-line bg-card p-4"><summary className="cursor-pointer text-lg font-semibold">Compare everything in one table</summary><div className="mt-4"><PricingTable /></div></details>
        <p className="mt-6 text-sm text-ink-2">Prices are early-stage experiments. If a price changes, it only affects future purchases. Questions? <Link className="font-semibold text-brand underline" to="/help">Visit the help centre</Link>.</p>
      </div>
    </>
  );
}
