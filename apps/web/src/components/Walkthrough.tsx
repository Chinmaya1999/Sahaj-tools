import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cx } from "./ui";

const SCENES = [
  { title: "A customer asks for a bill", body: "Add items. Totals and GST are worked out for you, and checked again on our server.", tag: "Invoices" },
  { title: "Send it in one tap", body: "Download the PDF or share a WhatsApp message. Record payments as they come in.", tag: "Share" },
  { title: "Stock updates as you sell", body: "Every sale, return and damage is logged. Low-stock and expiry lists show what needs attention.", tag: "Inventory" },
  { title: "Get found and get paid", body: "Share a QR code and a mini web page with your services, hours and WhatsApp button.", tag: "QR & page" },
] as const;
const MS = 4500;

function Scene({ i }: { i: number }) {
  const row = (a: string, b: string, d: number) => <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: d }} className="flex justify-between rounded-lg bg-paper px-3 py-2 text-sm"><span>{a}</span><b>{b}</b></motion.div>;
  if (i === 0) return <div className="space-y-2">{row("Wiring work × 2", "₹1,000", 0.2)}{row("Switch × 1", "₹123", 0.6)}{row("GST", "₹202", 1)}<motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.5 }} className="rounded-lg bg-brand px-3 py-3 text-right text-lg font-bold text-white">Total ₹1,325</motion.div></div>;
  if (i === 1) return <div className="space-y-3"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-line bg-white p-3 text-sm">📄 INV-0042.pdf · 1 page</motion.div><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#d9fdd3] p-3 text-sm text-ink">Hello Ravi, invoice INV-0042: total ₹1,325. Thank you!</motion.div><motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="text-right text-xs font-bold text-ok">✓ Marked as paid</motion.p></div>;
  if (i === 2) return <div className="space-y-2">{[["Aloe face wash", 6, 5], ["Lip balm", 12, 5]].map(([n, q, m], k) => <motion.div key={n as string} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + k * 0.3 }} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm"><span>{n}</span><motion.b key={k} initial={{ color: "#1f1d1a" }} animate={k === 0 ? { color: ["#1f1d1a", "#92400e"] } : {}} transition={{ delay: 1.4 }}>{k === 0 ? <motion.span initial={{ opacity: 1 }}>{q as number} → 5 · low</motion.span> : `${q} in stock`}</motion.b></motion.div>)}<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="text-xs font-semibold text-warn">Reorder suggestion: 5 more</motion.p></div>;
  return <div className="flex items-center gap-4"><motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.8 }} className="grid h-24 w-24 grid-cols-5 gap-0.5 rounded-xl border border-line bg-white p-2">{Array.from({ length: 25 }, (_, k) => <i key={k} className={((k * 7 + k % 3) % 3 === 0 || [0, 4, 20, 24, 6, 8, 16, 18].includes(k)) ? "bg-ink" : "bg-paper-2"} />)}</motion.div><motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="flex-1 rounded-xl border border-line bg-white p-3"><p className="font-display text-lg font-semibold">Priya Salon</p><p className="text-xs text-ink-2">Open 9–7 · Call · WhatsApp</p><p className="mt-2 text-xs font-semibold text-brand">Haircut ₹200 · Facial ₹600</p></motion.div></div>;
}

/** Original animated product walkthrough (a code-driven "video"). Has pause control, step buttons, and a static fallback for reduced motion. */
export function Walkthrough() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0); const [playing, setPlaying] = useState(true);
  useEffect(() => { if (!playing || reduce) return; const t = setTimeout(() => setI((x) => (x + 1) % SCENES.length), MS); return () => clearTimeout(t); }, [i, playing, reduce]);
  const s = SCENES[i];
  return (
    <div className="overflow-hidden rounded-3xl bg-ink text-white shadow-lift" role="group" aria-label="Animated product walkthrough">
      <div className="grid gap-6 p-6 md:grid-cols-2 md:p-10">
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-[#c7c9ff]">Step {i + 1} of {SCENES.length} · {s.tag}</p>
          <AnimatePresence mode="wait"><motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><h3 className="mt-2 text-3xl font-semibold">{s.title}</h3><p className="mt-3 text-white/80">{s.body}</p></motion.div></AnimatePresence>
          <div className="mt-6 flex items-center gap-3">
            <button className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/20" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>{playing && !reduce ? "❚❚ Pause" : "▶ Play"}</button>
            <div className="flex gap-1.5">{SCENES.map((x, k) => <button key={x.tag} aria-label={`Show step ${k + 1}: ${x.tag}`} aria-current={k === i} onClick={() => setI(k)} className="grid h-11 w-6 place-items-center"><span className={cx("block h-2 rounded-full transition-all", k === i ? "w-6 bg-white" : "w-2 bg-white/40")} /></button>)}</div>
          </div>
        </div>
        <div className="relative min-h-[240px] rounded-2xl bg-white p-5 text-ink">
          <AnimatePresence mode="wait"><motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Scene i={i} /></motion.div></AnimatePresence>
          {playing && !reduce && <motion.div key={`p${i}`} className="absolute inset-x-0 bottom-0 h-1 origin-left bg-brand" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: MS / 1000, ease: "linear" }} />}
        </div>
      </div>
      <p className="border-t border-white/10 px-6 py-3 text-xs text-white/70">Illustration of how the tools work together. Sample names and amounts only.</p>
    </div>
  );
}
