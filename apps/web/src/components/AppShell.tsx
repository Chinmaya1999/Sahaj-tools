import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BRAND, PRODUCTS } from "@ek/shared";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { Logo, LogoMark } from "./Logo";
import { cx } from "./ui";

/* ------------------------------------------------------------------ navigation model */
interface Item { to: string; label: string; icon: string; end?: boolean; keywords?: string }
interface Group { label: string; items: Item[] }

const tool = (slug: string, label: string, keywords = ""): Item => ({ to: `/tools/${slug}`, label, icon: PRODUCTS.find((p) => p.slug === slug)!.icon, keywords });
const GROUPS: Group[] = [
  { label: "", items: [{ to: "/account", label: "Dashboard", icon: "🏠", end: true, keywords: "home overview summary" }] },
  { label: "Run my business", items: [
    tool("invoice", "Invoices & quotes", "bill gst payment customer"),
    tool("inventory", "Stock & sales", "inventory ministock products orders sell pos customers suppliers purchase expenses profit"),
    tool("qr-business", "QR & business page", "qr code mini website whatsapp upi"),
  ] },
  { label: "Documents & creative", items: [
    tool("resume", "Resume builder", "cv job cover letter"),
    tool("invitation", "Invitations", "wedding birthday card odia"),
    tool("pdf-tools", "PDF tools", "merge split rotate compress"),
    tool("photo-tools", "Photo resize", "passport signature compress kb"),
  ] },
  { label: "My account", items: [
    { to: "/account/orders", label: "Orders & receipts", icon: "🛍️", keywords: "payments purchases invoices receipt" },
    { to: "/account/library", label: "Software library", icon: "📚", keywords: "downloads plans entitlements" },
    { to: "/account/downloads", label: "Download history", icon: "⬇️" },
    { to: "/account/settings", label: "Settings", icon: "⚙️", keywords: "profile password export delete data" },
  ] },
  { label: "Get more", items: [
    { to: "/pricing", label: "Plans & pricing", icon: "💳", keywords: "upgrade buy" },
    { to: "/bundles", label: "Bundles", icon: "🎁" },
    { to: "/help", label: "Help centre", icon: "❓", keywords: "faq support" },
  ] },
];
const ADMIN: Item = { to: "/admin", label: "Admin", icon: "🛡️" };

const ACTIONS: Item[] = [
  { to: "/tools/invoice", label: "Create an invoice", icon: "🧾", keywords: "new bill" },
  { to: "/tools/inventory?tab=sell", label: "Make a sale", icon: "🛒", keywords: "new sale pos checkout" },
  { to: "/tools/inventory?tab=products", label: "Add a product", icon: "📦", keywords: "new item stock sku" },
  { to: "/tools/inventory?tab=orders", label: "See orders", icon: "📋" },
  { to: "/tools/inventory?tab=money", label: "Profit & expenses", icon: "💰", keywords: "finance cash" },
  { to: "/tools/resume", label: "Build a resume", icon: "📄" },
  { to: "/tools/qr-business", label: "Make a QR code", icon: "🔳" },
];
const QUICK = ACTIONS.slice(0, 3).concat(ACTIONS.slice(5, 7));

/** Title shown in the top bar for the current page. */
function titleFor(path: string, groups: Group[]) {
  const all = groups.flatMap((g) => g.items);
  const hit = all.filter((i) => path === i.to || path.startsWith(i.to + "/")).sort((a, b) => b.to.length - a.to.length)[0];
  return hit?.label ?? "Workspace";
}

/* ------------------------------------------------------------------ sidebar */
function NavList({ groups, collapsed, onNavigate }: { groups: Group[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Workspace" className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
      {groups.map((g) => (
        <div key={g.label}>
          {g.label ? (!collapsed ? <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-2">{g.label}</p> : <div className="mx-3 mb-2 h-px bg-line" />) : null}
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} end={i.end} onClick={onNavigate} title={collapsed ? i.label : undefined}
                  className={({ isActive }) => cx("group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", collapsed && "justify-center px-0", isActive ? "nav-active" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}>
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center text-lg">{i.icon}</span>
                  <span className={cx("truncate", collapsed && "sr-only")}>{i.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth(); const nav = useNavigate();
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={cx("border-t border-line p-3", collapsed && "flex flex-col items-center gap-2")}>
      <Link to="/account/settings" className={cx("flex items-center gap-3 rounded-xl p-2 hover:bg-paper-2", collapsed && "justify-center")} title="Profile and settings">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-holo-violet text-sm font-bold text-(--color-on-brand)">{initials}</span>
        {!collapsed && <span className="min-w-0"><span className="block truncate text-sm font-semibold">{user.name}</span><span className="block truncate text-xs text-ink-2">{user.email}</span></span>}
      </Link>
      <button type="button" aria-label="Sign out" onClick={async () => { await logout(); nav("/", { replace: true }); }}
        className={cx("mt-1 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-2 hover:bg-bad-bg hover:text-bad", collapsed && "w-10 justify-center px-0")}>
        <span aria-hidden>⎋</span>{!collapsed && "Sign out"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ command palette */
function Palette({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const nav = useNavigate(); const [q, setQ] = useState(""); const [i, setI] = useState(0); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return items.slice(0, 12);
    return items.filter((x) => `${x.label} ${x.keywords ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [q, items]);
  const go = (x: Item) => { onClose(); nav(x.to); };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/50 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-paper shadow-lift">
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="Search tools, pages and actions" placeholder="Search tools, pages and actions…"
          className="w-full border-b border-line bg-transparent px-4 py-4 text-base outline-none placeholder:text-ink-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
            else if (e.key === "Enter" && results[i]) go(results[i]);
          }} />
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length ? results.map((r, n) => (
            <li key={r.to + r.label} role="option" aria-selected={n === i}>
              <button type="button" onMouseEnter={() => setI(n)} onClick={() => go(r)} className={cx("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm", n === i ? "nav-active" : "hover:bg-paper-2")}>
                <span aria-hidden className="text-lg">{r.icon}</span>{r.label}
              </button>
            </li>
          )) : <li className="px-3 py-6 text-center text-sm text-ink-2">Nothing matches “{q}”.</li>}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-ink-2">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ quick create */
function QuickCreate() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn-holo inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold"><span aria-hidden className="text-lg leading-none">+</span><span className="hidden sm:inline">New</span><span className="sr-only sm:hidden">Create new</span></button>
      {open && (
        <ul role="menu" className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-paper p-1.5 shadow-lift">
          {QUICK.map((a) => <li key={a.to} role="none"><button role="menuitem" type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-paper-2" onClick={() => { setOpen(false); nav(a.to); }}><span aria-hidden className="text-lg">{a.icon}</span>{a.label}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/** Goes to the previous page; if the visitor landed here directly, goes to the dashboard instead of leaving the site. */
function BackButton() {
  const nav = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return <button type="button" onClick={() => (canGoBack ? nav(-1) : nav("/account"))} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink"><span aria-hidden>←</span> Back</button>;
}

/* ------------------------------------------------------------------ shell */
export function AppShell() {
  const { user } = useAuth(); const loc = useLocation(); const reduce = useReducedMotion();
  const groups = useMemo(() => (user?.role === "admin" ? [...GROUPS.slice(0, 4), { label: "Administration", items: [ADMIN] }, GROUPS[4]] : GROUPS), [user?.role]);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sahaj-sidebar") === "1"; } catch { return false; } });
  const [drawer, setDrawer] = useState(false); const [palette, setPalette] = useState(false);
  const toggle = useCallback(() => setCollapsed((c) => { const n = !c; try { localStorage.setItem("sahaj-sidebar", n ? "1" : "0"); } catch { /* ignore */ } return n; }), []);
  useEffect(() => { setDrawer(false); }, [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { document.body.style.overflow = drawer ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [drawer]);
  const paletteItems = useMemo(() => [...ACTIONS, ...groups.flatMap((g) => g.items)], [groups]);
  const title = titleFor(loc.pathname, groups);
  const hasUser = !!user;

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* desktop sidebar */}
      <aside className={cx("no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-card/70 backdrop-blur-xl transition-[width] duration-200 lg:flex", collapsed ? "w-[4.75rem]" : "w-[17rem]")}>
        <div className={cx("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
          <Link to="/account" aria-label={`${BRAND.name} dashboard`}>{collapsed ? <LogoMark size={34} /> : <Logo />}</Link>
        </div>
        <NavList groups={groups} collapsed={collapsed} />
        <UserCard collapsed={collapsed} />
        <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-line bg-card text-xs text-ink-2 shadow-soft hover:text-ink">{collapsed ? "›" : "‹"}</button>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" onKeyDown={(e) => e.key === "Escape" && setDrawer(false)}>
            <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/50" onClick={() => setDrawer(false)} />
            <motion.aside initial={reduce ? false : { x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", duration: 0.22 }} className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-paper pt-[env(safe-area-inset-top)] shadow-lift">
              <div className="flex h-16 items-center justify-between px-4"><Logo /><button type="button" aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-paper-2" onClick={() => setDrawer(false)}>✕</button></div>
              <NavList groups={groups} collapsed={false} onNavigate={() => setDrawer(false)} />
              <UserCard collapsed={false} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper/80 px-3 backdrop-blur-xl pt-[env(safe-area-inset-top)] sm:px-5 lg:h-16">
          <button type="button" aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-xl border border-line lg:hidden" onClick={() => setDrawer(true)}>☰</button>
          {loc.pathname !== "/account" && <BackButton />}
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold lg:hidden">{title}</p>
          <button type="button" onClick={() => setPalette(true)} aria-label="Search" className="hidden min-h-10 max-w-md flex-1 items-center gap-2 rounded-xl border border-line bg-card/60 px-3 text-left text-sm text-ink-2 transition-colors hover:border-brand lg:flex">
            <span aria-hidden>🔍</span><span className="flex-1">Search tools, pages and actions…</span><kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">⌘K</kbd>
          </button>
          <div className="hidden flex-1 lg:block" />
          <button type="button" onClick={() => setPalette(true)} aria-label="Search" className="grid h-10 w-10 place-items-center rounded-xl border border-line lg:hidden">🔍</button>
          <QuickCreate />
          <ThemeToggle />
        </header>

        <main id="main" className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10" key={loc.pathname.split("/")[1] + (loc.pathname.split("/")[2] ?? "")}>
          {hasUser && <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}><Outlet /></motion.div>}
        </main>
      </div>

      {/* phone tab bar */}
      <nav aria-label="Quick tabs" className="tab-bar no-print lg:hidden">
        {[["/account", "Home", "🏠", true], ["/tools/invoice", "Invoices", "🧾", false], ["/tools/inventory", "Stock", "📦", false], ["/account/orders", "Orders", "🛍️", false]].map(([to, label, icon, end]) => (
          <NavLink key={to as string} to={to as string} end={end as boolean} className={({ isActive }) => cx("tab-item", isActive && "tab-item-active")}><span aria-hidden className="text-xl leading-none">{icon}</span><span>{label}</span></NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} className="tab-item" aria-label="More"><span aria-hidden className="text-xl leading-none">☰</span><span>More</span></button>
      </nav>

      {palette && <Palette items={paletteItems} onClose={() => setPalette(false)} />}
    </div>
  );
}
