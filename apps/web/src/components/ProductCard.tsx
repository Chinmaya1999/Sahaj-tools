import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PLANS, formatInr, type ProductInfo } from "@ek/shared";
import { Badge, LinkButton } from "./ui";
import { ProductDemo } from "./ProductDemo";
import { ProductArt } from "./Art";
import { useCatalog } from "../lib/data";

export function ProductCard({ product: p, withDemo }: { product: ProductInfo; withDemo?: boolean }) {
  const reduce = useReducedMotion();
  const cat = useCatalog();
  const plans = (cat.data?.plans ?? PLANS).filter((x) => x.product === p.slug && x.kind !== "free" && (("active" in x ? x.active : true)));
  const from = plans.length ? Math.min(...plans.map((x) => x.pricePaise)) : 0;
  return (
    <motion.article whileHover={reduce ? undefined : { y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-soft hover:shadow-lift">
      <div className="-mx-1 -mt-1 mb-3 overflow-hidden rounded-xl"><ProductArt slug={p.slug} accent={p.accent} /></div>
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl text-xl" style={{ background: `${p.accent}18` }}>{p.icon}</span>
        <Badge tone="ok">Free: {p.free}</Badge>
      </div>
      <h3 className="mt-3 text-xl font-semibold"><Link to={`/tools/${p.slug}/about`} className="hover:underline">{p.name}</Link></h3>
      <p className="mt-1 text-sm text-ink-2">{p.problem}</p>
      <p className="mt-2 text-xs text-ink-2"><b>For:</b> {p.audience}</p>
      <ul className="mt-3 space-y-1 text-sm">{p.features.slice(0, 4).map((f) => <li key={f}>✓ {f}</li>)}</ul>
      {withDemo && <div className="mt-4 rounded-xl border border-line bg-paper-2/50 p-3"><ProductDemo slug={p.slug} /></div>}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-ink-2">
        <div><dt className="font-semibold text-ink">Delivery</dt><dd>{p.delivery}</dd></div>
        <div><dt className="font-semibold text-ink">Requirements</dt><dd>{p.requirements}</dd></div>
      </dl>
      <div className="mt-auto pt-4">
        <p className="mb-2 text-sm">{from ? <>Paid options from <b>{formatInr(from)}</b></> : "Free to use"}</p>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/tools/${p.slug}`} variant="secondary" className="flex-1">Try it</LinkButton>
          <LinkButton to={`/tools/${p.slug}/about`} className="flex-1">Upgrade</LinkButton>
        </div>
      </div>
    </motion.article>
  );
}
