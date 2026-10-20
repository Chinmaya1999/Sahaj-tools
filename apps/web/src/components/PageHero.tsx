import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Shared top-of-page banner for the main sections: eyebrow, title (the page's only h1), subtitle, optional extra content and art. */
export function PageHero({ eyebrow, title, sub, children, art }: { eyebrow: string; title: string; sub: string; children?: ReactNode; art?: ReactNode }) {
  const reduce = useReducedMotion();
  const a = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.45 } });
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50/70 to-paper">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-warn/10 blur-3xl" />
      <div className="relative mx-auto grid grid-cols-[minmax(0,1fr)] max-w-6xl items-center gap-8 px-4 py-8 md:py-14 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <motion.p {...a(0)} className="text-sm font-bold uppercase tracking-wider text-brand-700">{eyebrow}</motion.p>
          <motion.h1 {...a(0.05)} className="mt-2 text-3xl font-semibold leading-[1.12] sm:text-5xl">{title}</motion.h1>
          <motion.p {...a(0.1)} className="mt-3 max-w-2xl text-lg text-ink-2">{sub}</motion.p>
          {children && <motion.div {...a(0.16)} className="mt-6">{children}</motion.div>}
        </div>
        {art && <motion.div {...a(0.12)} aria-hidden className="hidden lg:block">{art}</motion.div>}
      </div>
    </section>
  );
}

export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${active ? "border-ink bg-ink text-white" : "border-line bg-card hover:bg-paper-2"}`}>
      {children}{count !== undefined && <span className={`ml-1.5 text-xs ${active ? "text-white/80" : "text-ink-2"}`}>{count}</span>}
    </button>
  );
}

/** Row of small floating product tiles used as page-header art. */
export function TileArt({ icons }: { icons: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {icons.map((i, k) => <div key={k} className="grid aspect-square place-items-center rounded-2xl border border-line bg-card text-3xl shadow-soft" style={{ transform: `translateY(${[0, 14, -6][k % 3]}px) rotate(${[-3, 2, -1][k % 3]}deg)` }}>{i}</div>)}
    </div>
  );
}
