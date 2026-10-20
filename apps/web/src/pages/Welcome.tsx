import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PRODUCTS } from "@ek/shared";
import { Hero3D } from "../components/Hero3D";
import { Logo } from "../components/Logo";
import { LinkButton } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";

/** What the rotating headline line says the app does. */
const DOES = ["Invoices & GST bills", "Stock & sales", "Profit & who owes you", "QR codes & mini websites", "Resumes & job tools", "PDF & photo tools"];
const SHORT: Record<string, string> = { invoice: "Invoices", resume: "Resume", inventory: "Stock & sales", invitation: "Invitations", "pdf-tools": "PDF tools", "qr-business": "QR & pages", "photo-tools": "Photo resize" };

/**
 * The landing screen of the Android, iOS and Windows apps for people who are not signed in.
 * A holographic 3D scene (rotating crystal, orbiting product cards, projector beam), the promise, and two clear actions.
 */
export default function Welcome() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => { if (reduce) return; const t = setInterval(() => setI((n) => (n + 1) % DOES.length), 2200); return () => clearInterval(t); }, [reduce]);
  if (user) return <Navigate to="/account" replace />;
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.6, ease: "easeOut" as const } });

  return (
    <div className="welcome relative flex min-h-[100dvh] flex-col overflow-hidden pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <header className="relative z-10 flex items-center justify-between px-5 pt-3">
        <motion.div {...rise(0)}><Logo /></motion.div>
        <motion.div {...rise(0.05)}><ThemeToggle /></motion.div>
      </header>

      {/* hologram scene */}
      <section aria-hidden className="relative mx-auto mt-1 w-full max-w-md px-2 md:max-w-xl">
        <motion.div initial={reduce ? false : { opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} className="holo-scan relative rounded-[2rem]">
          <Hero3D />
        </motion.div>
        <div className="holo-projector" />
      </section>

      <main className="relative z-10 mx-auto mt-2 flex w-full max-w-md flex-1 flex-col justify-center px-6 text-center md:max-w-xl">
        <motion.p {...rise(0.25)} className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-ok" /> Made for small shops, sellers and freelancers
        </motion.p>
        <motion.h1 {...rise(0.32)} className="text-[2.1rem] font-semibold leading-[1.1] sm:text-5xl">
          Your whole business, <span className="holo-text">in your pocket.</span>
        </motion.h1>
        <motion.div {...rise(0.42)} className="mx-auto mt-4 flex h-8 items-center justify-center text-lg text-ink-2" aria-live="polite">
          <span className="mr-1.5">Run</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.b key={DOES[i]} initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduce ? undefined : { opacity: 0, y: -12, filter: "blur(4px)" }} transition={{ duration: 0.35 }} className="font-semibold text-ink">
              {DOES[i]}
            </motion.b>
          </AnimatePresence>
        </motion.div>

        <motion.div {...rise(0.52)} className="mt-6 grid gap-3">
          <LinkButton to="/register" className="min-h-14 text-base">Get started free</LinkButton>
          <LinkButton to="/login" variant="secondary" className="min-h-14 text-base">I already have an account</LinkButton>
        </motion.div>
        <motion.ul {...rise(0.62)} className="mx-auto mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-2">
          {["Free to try, no card", "Prices in ₹", "Your files stay on your device"].map((t) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden className="text-ok">✓</span>{t}</li>)}
        </motion.ul>
      </main>

      {/* all the tools, drifting by */}
      <motion.div {...rise(0.72)} aria-hidden className="relative z-10 mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="marquee gap-3 py-1">
          {[...PRODUCTS, ...PRODUCTS].map((p, k) => (
            <span key={k} className="mr-3 inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-card/70 px-4 py-2 text-sm font-medium backdrop-blur"><span className="text-lg">{p.icon}</span>{SHORT[p.slug] ?? p.name}</span>
          ))}
        </div>
      </motion.div>

      <footer className="relative z-10 mt-3 px-6 text-center text-xs text-ink-2">
        <Link className="underline" to="/terms">Terms</Link> · <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/help">Help</Link>
      </footer>
    </div>
  );
}
