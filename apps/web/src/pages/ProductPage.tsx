import { Link, useParams } from "react-router-dom";
import { PRODUCTS, formatInr } from "@ek/shared";
import { Alert, Badge, Card, LinkButton, Reveal } from "../components/ui";
import { ProductDemo } from "../components/ProductDemo";
import { ProductArt } from "../components/Art";
import { useCatalog } from "../lib/data";
import NotFound from "./NotFound";

export default function ProductPage() {
  const { slug } = useParams();
  const p = PRODUCTS.find((x) => x.slug === slug);
  const cat = useCatalog();
  if (!p) return <NotFound />;
  const plans = (cat.data?.plans ?? []).filter((x) => x.product === p.slug);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm"><Link to="/explore" className="text-brand underline">← All tools</Link></p>
      <div className="mt-3 grid gap-8 md:grid-cols-2">
        <div>
          <span aria-hidden className="text-4xl">{p.icon}</span>
          <h1 className="mt-2 text-4xl font-semibold">{p.name}</h1>
          <p className="mt-3 text-lg text-ink-2">{p.problem}</p>
          <p className="mt-3 text-sm"><b>Who it is for:</b> {p.audience}</p>
          <ul className="mt-4 space-y-1.5">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="font-semibold">Delivery</dt><dd className="text-ink-2">{p.delivery}</dd></div><div><dt className="font-semibold">System requirements</dt><dd className="text-ink-2">{p.requirements}</dd></div></dl>
          <LinkButton to={`/tools/${p.slug}`} className="mt-6">Open the tool</LinkButton>
        </div>
        <div className="space-y-4"><div className="overflow-hidden rounded-2xl border border-line shadow-soft"><ProductArt slug={p.slug} accent={p.accent} /></div><Card className="p-5"><h2 className="mb-3 text-xl">Try it now</h2><ProductDemo slug={p.slug} /></Card></div>
      </div>
      <Reveal>
        <h2 className="mb-4 mt-12 text-2xl font-semibold">Plans & pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((pl) => (
            <Card key={pl.id} className="flex flex-col p-5">
              <div className="flex items-center justify-between"><h3 className="text-xl">{pl.name}</h3>{pl.kind === "free" && <Badge tone="ok">Free</Badge>}</div>
              <p className="mt-2 text-3xl font-semibold">{pl.kind === "free" ? "₹0" : formatInr(pl.pricePaise)}</p>
              <p className="text-xs text-ink-2">{pl.billing}</p>
              <p className="mt-3 flex-1 text-sm">{pl.blurb}</p>
              {pl.kind === "free" ? <LinkButton to={`/tools/${p.slug}`} variant="secondary" className="mt-4">Start free</LinkButton>
                : <LinkButton to={`/checkout/plan/${pl.id}`} className="mt-4" aria-disabled={!pl.active}>{pl.active ? "Buy" : "Unavailable"}</LinkButton>}
            </Card>
          ))}
        </div>
        <div className="mt-4"><Alert>Prices include everything shown here. The final amount is displayed on the checkout page before you pay; nothing renews automatically.</Alert></div>
      </Reveal>
    </div>
  );
}
