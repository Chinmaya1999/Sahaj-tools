import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BRAND, renderSeoHead } from "@ek/shared";
import { useAuth } from "../lib/auth";
import { LinkButton, Spinner, cx } from "./ui";
import { ThemeToggle } from "../lib/theme";
import { AppShell } from "./AppShell";
import { Logo } from "./Logo";
import { isApp } from "../lib/native";

const links = [["/explore", "Tools"], ["/free-tools", "Free tools"], ["/pricing", "Pricing"], ["/bundles", "Bundles"], ["/help", "Help"]] as const;

export { Logo, LogoMark } from "./Logo";

/** Goes to the previous page; if the visitor landed here directly, goes home instead of leaving the site. */
function BackBar() {
  const nav = useNavigate(); const loc = useLocation();
  if (loc.pathname === "/" || loc.pathname.startsWith("/p/")) return null;
  if (isApp() && ["/login", "/register"].includes(loc.pathname)) return null; // the apps open on these screens: nothing to go back to
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <div className="no-print mx-auto w-full max-w-6xl px-4 pt-4">
      <button type="button" onClick={() => (canGoBack ? nav(-1) : nav("/"))} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink"><span aria-hidden>←</span> Back</button>
    </div>
  );
}

/** Keeps <title>, description, keywords, canonical, Open Graph and JSON-LD in sync with the current page. */
function useSeo(pathname: string) {
  useEffect(() => {
    document.head.querySelectorAll("[data-seo]").forEach((n) => n.remove());
    const tpl = document.createElement("template");
    tpl.innerHTML = renderSeoHead(pathname, window.location.origin);
    document.head.append(tpl.content);
  }, [pathname]);
}

export function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  useSeo(loc.pathname);
  const reduce = useReducedMotion();
  // New page -> start at the top; links with #section -> jump to that section.
  useEffect(() => {
    if (loc.hash) { const t = setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }), 80); return () => clearTimeout(t); }
    window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash, reduce]);
  const navCls = ({ isActive }: { isActive: boolean }) => cx("rounded-lg px-3 py-2 text-sm font-medium hover:bg-paper-2", isActive && "bg-paper-2");
  // Signed-in users get the workspace (sidebar, search, quick-create); visitors get the marketing site.
  if (user) return <AppShell />;
  const inApp = isApp();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="no-print sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl md:h-16 items-center justify-between px-4">
          <Link to="/" aria-label={`${BRAND.name} home`}><Logo /></Link>
          {!inApp && <nav aria-label="Main" className="hidden items-center gap-1 md:flex">{links.map(([to, t]) => <NavLink key={to} to={to} className={navCls}>{t}</NavLink>)}</nav>}
          <div className={cx("items-center gap-2", inApp ? "hidden" : "hidden md:flex")}>
            <ThemeToggle />
            <LinkButton to="/login" variant="ghost">Sign in</LinkButton><LinkButton to="/register">Get started</LinkButton>
          </div>
          <div className="flex items-center gap-2 md:hidden"><ThemeToggle /><LinkButton to="/login" variant="secondary" className="!min-h-10 !px-3">Sign in</LinkButton></div>
        </div>
      </header>
      <BackBar />
      <main id="main" className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0" key={loc.pathname.split("/")[1]}>
        <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><Outlet /></motion.div>
      </main>
      {inApp ? <AppFooter /> : <Footer />}
      {!inApp && <TabBar />}
    </div>
  );
}

const TABS = [
  { to: "/", label: "Home", end: true, d: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { to: "/explore", label: "Tools", d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { to: "/free-tools", label: "Free", d: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" },
  { to: "/pricing", label: "Pricing", d: "M4 7h16v10H4zM4 11h16M8 15h3" },
] as const;

/** Phone-only bottom navigation, like a native app. Hidden from md up and when printing. */
function TabBar() {
  const { user } = useAuth();
  const item = ({ isActive }: { isActive: boolean }) => cx("tab-item", isActive && "tab-item-active");
  const icon = (d: string) => <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <nav aria-label="App" className="tab-bar no-print md:hidden">
      {TABS.map((t) => <NavLink key={t.to} to={t.to} end={"end" in t} className={item}>{icon(t.d)}<span>{t.label}</span></NavLink>)}
      <NavLink to={user ? "/account" : "/login"} className={item}>{icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0")}<span>{user ? "Account" : "Sign in"}</span></NavLink>
    </nav>
  );
}

/** Compact footer for the apps: store policies require the legal links to be reachable. */
function AppFooter() {
  return (
    <footer className="no-print border-t border-line px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center text-xs text-ink-2">
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1"><Link className="underline" to="/terms">Terms</Link><Link className="underline" to="/privacy">Privacy</Link><Link className="underline" to="/refunds">Refunds</Link><Link className="underline" to="/help">Help</Link><Link className="underline" to="/contact">Contact</Link></p>
      <p className="mt-2">© {new Date().getFullYear()} {BRAND.name}</p>
    </footer>
  );
}

const APPS_URL = "https://github.com/Chinmaya1999/Sahaj-tools/releases/latest";
function Footer() {
  const col = (title: string, items: [string, string][]) => (
    <div><h2 className="font-sans text-sm font-semibold">{title}</h2><ul className="mt-3 space-y-2 text-sm text-ink-2">{items.map(([to, t]) => <li key={to}><Link className="hover:text-ink hover:underline" to={to}>{t}</Link></li>)}</ul></div>
  );
  return (
    <footer className="no-print mt-16 border-t border-line bg-paper-2/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div><Logo /><p className="mt-3 max-w-xs text-sm text-ink-2">{BRAND.tagline}</p></div>
        {col("Tools", [["/tools/invoice", "Invoices"], ["/tools/resume", "Resume builder"], ["/tools/inventory", "Inventory"], ["/tools/pdf-tools", "PDF tools"], ["/tools/photo-tools", "Photo resize"]])}
        {col("Support", [["/bundles", "Bundles"], ["/help", "Help centre & FAQ"], ["/contact", "Contact support"], ["/pricing", "Pricing"]])}
        {col("Legal", [["/terms", "Terms of service"], ["/privacy", "Privacy policy"], ["/refunds", "Refund & cancellation"]])}
        <div className="sm:col-span-2 md:col-span-4"><h2 className="font-sans text-sm font-semibold">Get the apps</h2><p className="mt-2 flex flex-wrap gap-2 text-sm">{["Android", "Windows", "iPhone & iPad"].map((n) => <a key={n} href={APPS_URL} target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-ink-2 hover:border-brand hover:text-ink">{n}</a>)}</p></div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-ink-2">© {new Date().getFullYear()} {BRAND.name}. Prices in INR.</p>
    </footer>
  );
}

export function RequireAuth({ admin }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/account" replace />;
  return <Outlet />;
}
