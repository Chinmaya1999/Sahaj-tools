import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BRAND, BUNDLES, PRODUCTS, formatInr, type ProductSlug } from "@ek/shared";
import { Badge, Card, LinkButton, Reveal } from "../components/ui";
import { ProductDemo } from "../components/ProductDemo";
import { ProductCard } from "../components/ProductCard";
import { Hero3D } from "../components/Hero3D";
import { Walkthrough } from "../components/Walkthrough";
import { FAQ, FAQ_ITEMS } from "./Help";
import { PricingTable } from "./Pricing";

const SHORT: Record<string, string> = { invoice: "Invoices", resume: "Resume", inventory: "Stock", invitation: "Invitations", "pdf-tools": "PDF", "qr-business": "QR", "photo-tools": "Photo" };

/** Pain → fix. Written around the problem the customer feels, then what the tool does about it. */
const PAINS: { who: string; pain: string; fix: string; slug: ProductSlug }[] = [
  { who: "Shop owner", pain: "Stock runs out, or goes out of date, and you only find out when a customer asks.", fix: "Log every sale and delivery. See low-stock and expiring items the moment you open the app.", slug: "inventory" },
  { who: "Freelancer or repair pro", pain: "Chasing payments and re-typing bills in spreadsheets with wrong totals.", fix: "Professional invoices with correct tax in a minute, a PDF or WhatsApp message, and a clear unpaid list.", slug: "invoice" },
  { who: "Job seeker", pain: "Your resume gets ignored and you don't know why.", fix: "A clean, ATS-friendly layout, a keyword check against the job post, and a matching cover letter.", slug: "resume" },
  { who: "Local business", pain: "Customers can't find your number, hours or prices.", fix: "A QR code and a simple mobile page with your services, hours, map and WhatsApp button.", slug: "qr-business" },
  { who: "Anyone with a form", pain: "The portal rejects your photo or signature: wrong pixels, too many KB.", fix: "Resize and compress to the exact size you enter, right in your browser. Nothing is uploaded.", slug: "photo-tools" },
  { who: "Office or student", pain: "Merging, splitting or fixing PDFs means uploading private files to random sites.", fix: "Do it privately on your own device. Merge, split, reorder, rotate, images to PDF.", slug: "pdf-tools" },
  { who: "Family or event host", pain: "Making a neat invitation in your own language is hard.", fix: "Beautiful English and Odia invitations, ready to share as an image or PDF.", slug: "invitation" },
];

export default function Home() {
  const reduce = useReducedMotion();
  const [demo, setDemo] = useState<ProductSlug>(PRODUCTS[0].slug);
  const active = PRODUCTS.find((p) => p.slug === demo)!;
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.5 } });
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-warn/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.05fr_1fr] md:py-20">
          <div>
            <motion.p {...rise(0)} className="mb-4 inline-block rounded-full border border-brand/40 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 shadow-[0_0_18px_-4px_rgb(34_211_238/0.6)]">{BRAND.tagline}</motion.p>
            <motion.h1 {...rise(0.05)} className="text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">Everything you need to solve <span className="holo-text">everyday problems.</span></motion.h1>
            <motion.p {...rise(0.12)} className="mt-5 max-w-xl text-lg text-ink-2">Bills, stock, resumes, invitations, PDFs, QR pages and photo sizes: seven simple tools that fix the small daily jobs that eat your time. Start free, pay only for what you use.</motion.p>
            <motion.div {...rise(0.2)} className="hero-actions mt-8 flex flex-wrap gap-3">
              <LinkButton to="/explore" className="px-6 text-base">Explore Tools</LinkButton>
              <LinkButton to="/free-tools" variant="secondary" className="px-6 text-base">Try Free Tools</LinkButton>
            </motion.div>
            <motion.ul {...rise(0.28)} className="mt-8 grid max-w-md gap-2 text-sm text-ink-2 sm:grid-cols-2">
              {["Free to try, no card", "Prices in ₹, no hidden charges", "Works on phone and computer", "Your files stay in your browser"].map((t) => <li key={t} className="flex items-center gap-2"><span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-ok-bg text-xs font-bold text-ok">✓</span>{t}</li>)}
            </motion.ul>
          </div>
          <Hero3D />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="problem-h">
        <Reveal><p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Sound familiar?</p><h2 id="problem-h" className="mt-1 text-3xl font-semibold sm:text-4xl">Choose your problem</h2><p className="mt-2 max-w-2xl text-ink-2">Pick the one that hurts most today. Each card shows what goes wrong and how the tool fixes it.</p></Reveal>
        <div className="snap-row mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PAINS.map((p, i) => {
            const prod = PRODUCTS.find((x) => x.slug === p.slug)!;
            return (
              <Reveal key={p.slug} delay={(i % 3) * 0.06}>
                <Link to={`/tools/${p.slug}`} className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-2">{p.who}</span>
                  <p className="mt-2 font-display text-xl font-semibold leading-snug">“{p.pain}”</p>
                  <p className="mt-3 flex-1 text-sm text-ink-2"><b className="text-ink">The fix:</b> {p.fix}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><span aria-hidden>{prod.icon}</span> {prod.name} <span aria-hidden className="transition group-hover:translate-x-1">→</span></span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="bg-paper-2/60 py-14" aria-labelledby="live-h">
        <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 md:grid-cols-[1fr_1.1fr]">
          <Reveal><p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Try it right now</p><h2 id="live-h" className="mt-1 text-3xl font-semibold sm:text-4xl">See it work before you sign up</h2><p className="mt-3 text-ink-2">These are the real calculations and checks, running in your browser. Change a number and watch the answer update.</p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">{["Totals and tax are re-checked on our server when you save", "Nothing you type here is stored", "Open the full tool whenever you are ready"].map((t) => <li key={t} className="flex gap-2"><span aria-hidden className="text-ok">✓</span>{t}</li>)}</ul></Reveal>
          <Card className="p-5 shadow-lift">
            <div role="tablist" aria-label="Choose a product demo" className="mb-4 flex flex-wrap gap-1.5">
              {PRODUCTS.map((p) => <button key={p.slug} role="tab" aria-selected={demo === p.slug} onClick={() => setDemo(p.slug)} className={`min-h-10 rounded-lg px-3 text-sm font-medium ${demo === p.slug ? "bg-ink text-white" : "bg-paper-2 hover:bg-line"}`}><span aria-hidden>{p.icon}</span> {SHORT[p.slug]}</button>)}
            </div>
            <div role="tabpanel" aria-label={active.name}>
              <h3 className="text-xl font-semibold">{active.name}</h3><p className="mb-4 text-sm text-ink-2">{active.problem}</p>
              <ProductDemo slug={active.slug} />
              <LinkButton to={`/tools/${active.slug}`} variant="secondary" className="mt-4 w-full">Open full tool →</LinkButton>
            </div>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="video-h">
        <Reveal><h2 id="video-h" className="mb-6 text-3xl font-semibold sm:text-4xl">A day with Sahaj</h2><Walkthrough /></Reveal>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6" aria-labelledby="products-h">
        <Reveal><h2 id="products-h" className="text-3xl font-semibold sm:text-4xl">Seven tools, one simple place</h2><p className="mt-2 max-w-2xl text-ink-2">Each tool works on its own, has a free way to start, and shows its real price up front.</p></Reveal>
        <div className="snap-row mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p, i) => <Reveal key={p.slug} delay={(i % 3) * 0.06}><ProductCard product={p} withDemo /></Reveal>)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="how-h">
        <Reveal><h2 id="how-h" className="text-3xl font-semibold sm:text-4xl">How it works</h2></Reveal>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {[["Discover", "Find the tool for your problem."], ["Try", "Use the free version straight away. No card needed."], ["Buy", "Pay once for a pack or a 30-day pass. Nothing renews by itself."], ["Use", "Open it online, or download the included files."]].map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 0.07} className="relative h-full rounded-2xl border border-line bg-card p-5 shadow-soft"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-sm font-bold text-(--color-on-brand)">{i + 1}</span><h3 className="mt-3 text-xl">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></Reveal>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6" aria-labelledby="price-h">
        <Reveal><h2 id="price-h" className="text-3xl font-semibold sm:text-4xl">Free vs paid, plainly</h2><p className="mt-2 text-ink-2">Prices are early-stage experiments and may change. The exact amount is always shown before you pay.</p></Reveal>
        <div className="mt-6"><PricingTable compact /></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {BUNDLES.map((b) => (
            <Card key={b.id} className="flex items-center justify-between gap-4 p-5">
              <div><Badge tone="brand">Bundle</Badge><h3 className="mt-2 text-xl">{b.name}</h3><p className="text-sm text-ink-2">{b.blurb}</p></div>
              <div className="text-right"><p className="text-2xl font-semibold">{formatInr(b.pricePaise)}</p><LinkButton to={`/checkout/bundle/${b.id}`} className="mt-2">Buy bundle</LinkButton></div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="sec-h">
        <Reveal><h2 id="sec-h" className="text-3xl font-semibold sm:text-4xl">Security, privacy and payments</h2></Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[["🔐", "Payments verified by our server", "Access unlocks only after the payment provider's signature is checked on our server. We never see or store card details."],
            ["🛡️", "Your files stay with you", "PDF, photo and invitation tools run inside your browser. Those files are not uploaded to our servers."],
            ["🧾", "Your data, your control", "Export everything we hold about you, or delete your account, at any time from your account page."]].map(([i, t, d]) => (
            <Card key={t} className="p-5"><span aria-hidden className="text-2xl">{i}</span><h3 className="mt-2 text-xl">{t}</h3><p className="mt-2 text-sm text-ink-2">{d}</p></Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-10" aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-4 text-3xl font-semibold">Frequently asked questions</h2>
        <FAQ items={FAQ_ITEMS.slice(0, 5)} />
        <p className="mt-4 text-sm"><Link className="font-semibold text-brand underline" to="/help">More answers in the help centre</Link></p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="holo-panel holo-scan relative overflow-hidden rounded-3xl bg-ink px-6 py-12 text-center text-white md:py-16">
          <div aria-hidden className="absolute -left-10 -top-10 h-56 w-56 rounded-full bg-brand/50 blur-3xl" />
          <h2 className="relative text-3xl font-semibold sm:text-4xl">Fix your first everyday problem today</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">Create a free account in under a minute. No card, nothing renews, and you can delete your data any time.</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3"><LinkButton to="/register" className="bg-white !text-ink hover:bg-paper-2">Start free today</LinkButton><LinkButton to="/pricing" variant="ghost" className="!text-white hover:!bg-white/10">See pricing</LinkButton></div>
        </div>
      </section>
    </>
  );
}
